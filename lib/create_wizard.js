// In-memory wizard sessions for character creation.
// Keyed by userId. Lost on bot restart (acceptable for v1).

const { lookupPlaybook } = require('./playbooks');
const { species, SPECIES_ORDER, TRAIT_BY_NAME } = require('./traits_data');

// Map: userId -> wizardState
const sessions = new Map();

const TRAIT_PICK_COUNT = 2;

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
 * @property {string|null} traitSpecies  - species currently browsed in the trait picker
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
		traitSpecies: SPECIES_ORDER[0],
		chosenMoves: [],
		orChoices: null,
		chosenPossessions: [],
	};
	sessions.set(userId, state);
	return state;
}

/**
 * Get existing wizard state. Returns null if none.
 */
function getWizard(userId) {
	return sessions.get(userId) || null;
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
	state.traitSpecies = SPECIES_ORDER[0];
	state.step = 'traits';
	return state;
}

/**
 * Browse a species' traits in the picker (no selection change).
 */
function browseSpecies(userId, speciesName) {
	const state = getWizard(userId);
	if (!state) return null;
	if (!SPECIES_ORDER.includes(speciesName)) return state;
	state.traitSpecies = speciesName;
	return state;
}

/**
 * Toggle a trait selection (up to TRAIT_PICK_COUNT).
 * Returns true if added, false if removed or refused.
 */
function toggleTrait(userId, traitName) {
	const state = getWizard(userId);
	if (!state) return false;
	const key = String(traitName || '').trim().toUpperCase();
	if (!TRAIT_BY_NAME[key]) return false;

	const idx = state.chosenTraits.indexOf(key);
	if (idx >= 0) {
		state.chosenTraits.splice(idx, 1);
		return false;
	}
	if (state.chosenTraits.length >= TRAIT_PICK_COUNT) return false;
	state.chosenTraits.push(key);
	return true;
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
			backgrounds: Object.entries(pb.backgrounds).map(([name, data]) => ({
				name,
				text: data.text,
				grants: data.grants || [],
			})),
		};

	case 'instinct':
		return {
			type: 'instinct_picker',
			instincts: Object.entries(pb.instincts).map(([name, desc]) => ({ name, desc })),
		};

	case 'traits': {
		const current = state.traitSpecies || SPECIES_ORDER[0];
		const sp = species[current] || species[SPECIES_ORDER[0]];
		return {
			type: 'traits_picker',
			speciesOrder: SPECIES_ORDER,
			species: current,
			flavor: sp.flavor,
			traits: sp.traits.map(t => ({ name: t.name, text: t.text })),
			chosen: state.chosenTraits.slice(),
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
 * Go back one step in the wizard, clearing the current step's choices.
 */
function backStep(userId) {
	const state = getWizard(userId);
	if (!state) return null;

	switch (state.step) {
	case 'background':
		state.playbookKey = null;
		state.playbookData = null;
		state.step = 'playbook';
		break;
	case 'instinct':
		state.background = null;
		state.grantedMoves = [];
		state.step = 'background';
		break;
	case 'traits':
		state.instinct = null;
		state.chosenTraits = [];
		state.step = 'instinct';
		break;
	case 'moves':
		state.chosenMoves = [];
		state.orChoices = null;
		state.step = 'traits';
		break;
	case 'possessions':
		state.chosenPossessions = [];
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
	browseSpecies,
	toggleTrait,
	toggleMove,
	setOrChoice,
	togglePossession,
	getStepInfo,
	advanceStep,
	backStep,
	TRAIT_PICK_COUNT,
};
