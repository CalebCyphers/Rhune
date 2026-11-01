// In-memory wizard sessions for character creation.
// Keyed by userId. Lost on bot restart (acceptable for v1); entries also
// expire after a while so abandoned sessions don't leak or go stale.

const { lookupPlaybook } = require('./playbooks');
const { TRAIT_BY_NAME, TRAIT_NAMES } = require('./traits_data');

// Map: userId -> wizardState
const sessions = new Map();

// A wizard session left untouched this long is discarded (abandoned flow).
const WIZARD_TTL_MS = 30 * 60 * 1000;

const TRAIT_PICK_COUNT = 2;
// Discord caps select menus at 25 options; page the trait list to stay under it.
const TRAIT_PAGE_SIZE = 24;

/**
 * @typedef {Object} WizardState
 * @property {string} step - 'playbook' | 'background' | 'instinct' | 'traits' | 'moves' | 'possessions' | 'confirm'
 * @property {string} userId
 * @property {string} guildId
 * @property {string} name
 * @property {string} playbookKey  - e.g. 'Blessed'
 * @property {Object|null} playbookData  - the full playbook object
 * @property {string|null} background  - selected background name
 * @property {string[]} grantedMoves  - moves automatically given by background
 * @property {string|null} instinct
 * @property {string[]} chosenTraits  - trait names picked (catalog names)
 * @property {number} traitPage  - current page of the trait list (0-based)
 */

/**
 * Start or reset a wizard session.
 */
function startWizard({ userId, guildId, name }) {
	const state = {
		step: 'playbook',
		userId,
		guildId,
		name,
		playbookKey: null,
		playbookData: null,
		background: null,
		grantedMoves: [],
		instinct: null,
		chosenTraits: [],
		traitPage: 0,
		chosenMoves: [],
		orChoices: null,
		chosenPossessions: [],
		updatedAt: Date.now(),
	};
	sessions.set(userId, state);
	return state;
}

/**
 * Get existing wizard state. Returns null if none, and discards stale ones.
 */
function getWizard(userId) {
	const state = sessions.get(userId) || null;
	if (state && Date.now() - (state.updatedAt || 0) > WIZARD_TTL_MS) {
		sessions.delete(userId);
		return null;
	}
	// Every wizard mutation goes through getWizard first, so a successful
	// access is the one place that refreshes a session's freshness.
	if (state) state.updatedAt = Date.now();
	return state;
}

/**
 * Clear a wizard session (e.g. on cancel or finalize).
 */
function clearWizard(userId) {
	sessions.delete(userId);
}

/**
 * Pick a playbook and advance to background step.
 */
function selectPlaybook(userId, playbookKey) {
	const state = getWizard(userId);
	if (!state) return null;
	const pb = lookupPlaybook(playbookKey);
	if (!pb) return null;
	// Changing playbook invalidates everything downstream (backgrounds,
	// instincts, moves, possessions are all playbook-specific).
	if (state.playbookKey !== playbookKey) {
		state.background = null;
		state.grantedMoves = [];
		state.instinct = null;
		state.chosenMoves = [];
		state.orChoices = null;
		state.chosenPossessions = [];
	}
	state.playbookKey = playbookKey;
	state.playbookData = pb;
	state.step = 'background';
	return state;
}

/**
 * Pick a background and advance to instinct step.
 */
function selectBackground(userId, bgName) {
	const state = getWizard(userId);
	if (!state) return null;
	const bg = state.playbookData.backgrounds[bgName];
	if (!bg) return null;
	// Changing background invalidates move picks (grants + or-groups change).
	if (state.background !== bgName) {
		state.chosenMoves = [];
		state.orChoices = null;
	}
	state.background = bgName;
	state.grantedMoves = bg.grants || [];
	state.step = 'instinct';
	return state;
}

/**
 * Pick an instinct and advance to the traits step.
 */
function selectInstinct(userId, instinctName) {
	const state = getWizard(userId);
	if (!state) return null;
	state.instinct = instinctName;
	state.chosenTraits = [];
	state.traitPage = 0;
	state.step = 'traits';
	return state;
}

/**
 * Flip the trait list to a given page (clamped to the valid range).
 */
function setTraitPage(userId, page) {
	const state = getWizard(userId);
	if (!state) return null;
	const count = Math.max(1, Math.ceil(TRAIT_NAMES.length / TRAIT_PAGE_SIZE));
	const p = Number.isFinite(Number(page)) ? parseInt(page, 10) : 0;
	state.traitPage = Math.min(Math.max(0, p), count - 1);
	return state;
}

/**
 * Set a specific trait slot (0 or 1). Passing the same trait clears the slot.
 */
function setTraitSlot(userId, slot, traitName) {
	const state = getWizard(userId);
	if (!state) return null;
	const i = parseInt(slot, 10);
	if (!(i === 0 || i === 1)) return state;
	const key = String(traitName || '').trim().toUpperCase();
	if (!TRAIT_BY_NAME[key]) return state;
	if (!Array.isArray(state.chosenTraits)) state.chosenTraits = [];
	// Clear the other slot if it already holds this trait (no duplicates).
	for (let j = 0; j < TRAIT_PICK_COUNT; j++) {
		if (j !== i && state.chosenTraits[j] === key) state.chosenTraits[j] = undefined;
	}
	state.chosenTraits[i] = state.chosenTraits[i] === key ? undefined : key;
	// Compact so the array stays [slot0, slot1].
	state.chosenTraits = [state.chosenTraits[0], state.chosenTraits[1]].filter(Boolean);
	return state;
}

/**
 * Clear a trait slot (0 or 1).
 */
function clearTrait(userId, slot) {
	const state = getWizard(userId);
	if (!state) return null;
	const i = parseInt(slot, 10);
	if (i >= 0 && i < state.chosenTraits.length) state.chosenTraits.splice(i, 1);
	return state;
}

/**
 * Toggle a starting move selection. Returns true if added, false if removed.
 * Also enforces the player's max pick count for free choices.
 */
function toggleMove(userId, moveName) {
	const state = getWizard(userId);
	if (!state) return false;
	const idx = state.chosenMoves.indexOf(moveName);
	if (idx >= 0) {
		state.chosenMoves.splice(idx, 1);
		return false;
	}
	// Check if already granted
	if (state.grantedMoves.includes(moveName)) return false;
	// Check max picks
	const max = state.playbookData.creationRules.startingPickCount || 0;
	if (state.chosenMoves.length >= max) return false;
	state.chosenMoves.push(moveName);
	return true;
}

/**
 * Record an OR-group choice by package name.
 * Each group has one package selected (e.g. 'Weapon Training' grants multiple moves).
 */
function setOrChoice(userId, groupIdx, packageName) {
	const state = getWizard(userId);
	if (!state) return null;
	if (!state.orChoices) state.orChoices = {};
	if (state.orChoices[groupIdx] === packageName) {
		// Toggle off
		delete state.orChoices[groupIdx];
	}
	else {
		state.orChoices[groupIdx] = packageName;
	}
	return state;
}

function togglePossession(userId, possessionName) {
	const state = getWizard(userId);
	if (!state) return null;
	if (!Array.isArray(state.chosenPossessions)) {
		state.chosenPossessions = [];
	}
	const idx = state.chosenPossessions.indexOf(possessionName);
	if (idx === -1) {
		state.chosenPossessions.push(possessionName);
	}
	else {
		state.chosenPossessions.splice(idx, 1);
	}
	return state;
}

/**
 * Determine which step the wizard should show next, given current state.
 * Returns an object describing what to render.
 */
function getStepInfo(userId) {
	const state = getWizard(userId);
	if (!state) return null;

	const pb = state.playbookData;

	switch (state.step) {
	case 'playbook':
		return {
			type: 'playbook_picker',
			playbooks: ['Blessed', 'Fox', 'Heavy', 'Judge', 'Lightbearer', 'Marshal', 'Ranger', 'Seeker', 'WouldbeHero'],
		};

	case 'background':
		return {
			type: 'background_picker',
			playbookKey: state.playbookKey,
			playbookName: pb.name,
			backgrounds: Object.entries(pb.backgrounds).map(([name, data]) => ({
				name,
				text: data.text,
				grants: data.grants || [],
			})),
		};

	case 'instinct':
		return {
			type: 'instinct_picker',
			playbookKey: state.playbookKey,
			playbookName: pb.name,
			instincts: Object.entries(pb.instincts).map(([name, desc]) => ({ name, desc })),
		};

	case 'traits': {
		const all = TRAIT_NAMES.slice().sort((a, b) => a.localeCompare(b));
		const pageCount = Math.max(1, Math.ceil(all.length / TRAIT_PAGE_SIZE));
		const page = Math.min(Math.max(0, state.traitPage || 0), pageCount - 1);
		return {
			type: 'traits_picker',
			playbookKey: state.playbookKey,
			allTraits: all.map(n => ({ name: n, text: TRAIT_BY_NAME[n] ? TRAIT_BY_NAME[n].text : '' })),
			page,
			pageSize: TRAIT_PAGE_SIZE,
			pageCount,
			chosen: state.chosenTraits.slice(),
			slots: [state.chosenTraits[0] || null, state.chosenTraits[1] || null],
			remaining: TRAIT_PICK_COUNT - state.chosenTraits.length,
			pickCount: TRAIT_PICK_COUNT,
		};
	}

	case 'moves': {
		const rules = pb.creationRules;
		const alreadyGranted = new Set([...state.grantedMoves, ...Object.keys(pb.startingMoves)]);

		// Resolve OR package choices to their granted moves
		const orGrantedMoves = new Set();
		if (rules.orGroups && state.orChoices) {
			for (const [gi, pkgName] of Object.entries(state.orChoices).filter(([, v]) => v)) {
				const group = rules.orGroups[parseInt(gi)];
				if (!group) continue;
				const pkg = group.options.find(o => o.name === pkgName);
				if (pkg && pkg.grants) {
					pkg.grants.forEach(m => orGrantedMoves.add(m));
				}
			}
		}

		const allGranted = new Set([...alreadyGranted, ...orGrantedMoves]);

		const available = [];
		for (const [moveName, moveData] of Object.entries(pb.allMoves || {})) {
			if (allGranted.has(moveName)) continue;
			if (moveData.starred) continue;
			available.push({ name: moveName, text: moveData.text });
		}

		const maxPicks = rules.startingPickCount || 0;

		return {
			type: 'moves_picker',
			playbookKey: state.playbookKey,
			playbookName: pb.name,
			autoGranted: [...state.grantedMoves, ...Object.keys(pb.startingMoves)],
			orGroups: rules.orGroups || null,
			orSelections: state.orChoices || {},
			orGrantedMoves: [...orGrantedMoves],
			available,
			maxPicks,
			currentPicks: state.chosenMoves.length,
			chosenMoves: state.chosenMoves,
			allMovesData: pb.allMoves || {},
		};
	}

	case 'possessions': {
		const poss = pb.creationRules?.possessions;
		if (!poss) {
			// Fallback: playbook has no possessions data, skip to confirm
			state.step = 'confirm';
			return getStepInfo(userId);
		}
		return {
			type: 'possessions_picker',
			playbookKey: state.playbookKey,
			playbookName: pb.name,
			always: poss.always || [],
			options: poss.options || [],
			pickCount: poss.pickCount || 0,
			chosen: state.chosenPossessions || [],
		};
	}

	case 'confirm': {
		// Resolve OR package choices to individual move names
		const orGrantedMoves = [];
		const rules = pb.creationRules;
		if (rules.orGroups && state.orChoices) {
			for (const [gi, pkgName] of Object.entries(state.orChoices).filter(([, v]) => v)) {
				const group = rules.orGroups[parseInt(gi)];
				if (!group) continue;
				const pkg = group.options.find(o => o.name === pkgName);
				if (pkg && pkg.grants) {
					pkg.grants.forEach(m => orGrantedMoves.push(m));
				}
			}
		}

		const chosenTraits = state.chosenTraits.map(name => {
			const t = TRAIT_BY_NAME[name];
			return { name, text: t ? t.text : '' };
		});

		return {
			type: 'confirm',
			playbookKey: state.playbookKey,
			name: state.name,
			playbook: pb.name,
			background: state.background,
			instinct: state.instinct,
			traits: chosenTraits,
			autoGrantedMoves: [...state.grantedMoves, ...Object.keys(pb.startingMoves), ...orGrantedMoves].filter(Boolean),
			pickedMoves: state.chosenMoves,
			allMoves: [...state.grantedMoves, ...Object.keys(pb.startingMoves), ...orGrantedMoves, ...state.chosenMoves].filter(Boolean),
			allMovesData: pb.allMoves || {},
			possessions: state.chosenPossessions || [],
		};
	}

	default:
		return null;
	}
}

/**
 * Advance to the next step. Returns the new step info.
 */
function advanceStep(userId) {
	const state = getWizard(userId);
	if (!state) return null;
	if (!state.playbookData) return getStepInfo(userId);

	const rules = state.playbookData.creationRules;

	if (state.step === 'traits') {
		if (state.chosenTraits.length < TRAIT_PICK_COUNT) return getStepInfo(userId);
		state.step = 'moves';
		return getStepInfo(userId);
	}

	if (state.step === 'moves') {
		const hasOrGroups = rules.orGroups && rules.orGroups.length > 0;
		if (hasOrGroups) {
			const allFilled = rules.orGroups.every((g, i) => state.orChoices && state.orChoices[i]);
			if (!allFilled) return getStepInfo(userId);
		}
		state.step = 'possessions';
		return getStepInfo(userId);
	}

	if (state.step === 'possessions') {
		state.step = 'confirm';
		return getStepInfo(userId);
	}

	// instinct -> traits is automatic (next step after any pick)
	return getStepInfo(userId);
}

/**
 * Go back one step in the wizard. The current step's picks are KEPT — you can
 * back up to re-read options without losing your work. Changing an upstream
 * step (playbook/background/instinct) clears downstream picks that no longer
 * apply — that invalidation lives in the select* functions.
 */
function backStep(userId) {
	const state = getWizard(userId);
	if (!state) return null;

	switch (state.step) {
	case 'background':
		state.step = 'playbook';
		break;
	case 'instinct':
		state.step = 'background';
		break;
	case 'traits':
		state.step = 'instinct';
		break;
	case 'moves':
		state.step = 'traits';
		break;
	case 'possessions':
		state.step = 'moves';
		break;
	case 'confirm':
		state.step = 'possessions';
		break;
	default:
		return null;
	}

	return state;
}

module.exports = {
	startWizard,
	getWizard,
	clearWizard,
	selectPlaybook,
	selectBackground,
	selectInstinct,
	setTraitPage,
	setTraitSlot,
	clearTrait,
	toggleMove,
	setOrChoice,
	togglePossession,
	getStepInfo,
	advanceStep,
	backStep,
	TRAIT_PICK_COUNT,
};
