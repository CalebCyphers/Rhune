// In-memory wizard sessions for character creation.
// Keyed by userId. Lost on bot restart (acceptable for v1).

const { lookupPlaybook } = require('./playbooks');

// Map: userId -> wizardState
const sessions = new Map();

/**
 * @typedef {Object} WizardState
 * @property {string} step - 'playbook' | 'background' | 'instinct' | 'stats' | 'moves' | 'confirm'
 * @property {string} userId
 * @property {string} guildId
 * @property {string} name
 * @property {string} playbookKey  - e.g. 'Blessed'
 * @property {Object|null} playbookData  - the full playbook object
 * @property {string|null} background  - selected background name
 * @property {string[]} grantedMoves  - moves automatically given by background
 * @property {string|null} instinct
 * @property {Object} stats  - { str, dex, con, int, wis, cha } each null initially, filled from pool
 * @property {string[]} statPool  - remaining scores to assign
 * @property {string[]} statPoolKeys  - composite keys for pool items (index:value), to disambiguate duplicates
 * @property {string|null} selectedPoolValue  - currently highlighted pool value (e.g. '+1')
 * @property {string|null} selectedPoolKey  - composite key of currently highlighted pool item
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
		stats: { str: null, dex: null, con: null, int: null, wis: null, cha: null },
		statPool: [],
		statPoolKeys: [],
		chosenMoves: [],
		orChoices: null,
		selectedPoolValue: null,
		selectedPoolKey: null,
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
 * The standard stat array for most playbooks.
 * Would-be-Hero uses a different pool — handled in selectInstinct.
 */
const STANDARD_STAT_POOL = ['+2', '+1', '+1', '+0', '+0', '-1'];
const HERO_STAT_POOL = ['+1', '+0', '+0', '+0', '+0', '-1'];

const STAT_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/**
 * Composite key for stat pool items, since values can repeat (+0 appears twice).
 */
function makePoolKey(index, value) {
	return `${index}:${value}`;
}

/**
 * Rebuild statPoolKeys from current statPool array.
 */
function rebuildPoolKeys(state) {
	state.statPoolKeys = state.statPool.map((v, i) => makePoolKey(i, v));
}

/**
 * Pick an instinct and advance to stats step.
 */
function selectInstinct(userId, instinctName) {
	const state = getWizard(userId);
	if (!state) return null;
	state.instinct = instinctName;
	state.statPool = state.playbookKey === 'WouldbeHero'
		? [...HERO_STAT_POOL]
		: [...STANDARD_STAT_POOL];
	rebuildPoolKeys(state);
	state.stats = { str: null, dex: null, con: null, int: null, wis: null, cha: null };
	state.selectedPoolValue = null;
	state.selectedPoolKey = null;
	state.step = 'stats';
	return state;
}

/**
 * Select (highlight) a pool value by its composite key (index:value), or deselect if same one clicked.
 */
function selectPoolValue(userId, poolIndex, scoreValue) {
	const state = getWizard(userId);
	if (!state) return null;
	const key = makePoolKey(poolIndex, scoreValue);
	if (state.selectedPoolKey === key) {
		state.selectedPoolKey = null;
		state.selectedPoolValue = null;
	}
	else {
		state.selectedPoolKey = key;
		state.selectedPoolValue = scoreValue;
	}
	return state;
}

/**
 * Assign the currently selected pool value to a stat.
 * If the stat already has a value, returns it to the pool.
 */
function assignStat(userId, statKey) {
	const state = getWizard(userId);
	if (!state) return null;
	if (!STAT_ORDER.includes(statKey)) return null;

	const oldVal = state.stats[statKey];
	const newVal = state.selectedPoolValue;

	if (oldVal !== null && newVal === null) {
		// Clicking an assigned stat with nothing selected — return to pool
		state.stats[statKey] = null;
		state.statPool.push(oldVal);
		state.statPool.sort((a, b) => parseInt(b) - parseInt(a));
		rebuildPoolKeys(state);
		return state;
	}

	if (oldVal !== null && newVal !== null) {
		// Swap: return old to pool, assign new
		state.stats[statKey] = newVal;
		state.statPool.push(oldVal);
		state.statPool.sort((a, b) => parseInt(b) - parseInt(a));
		// Remove newVal from pool
		const idx = state.statPool.indexOf(newVal);
		if (idx >= 0) {
			state.statPool.splice(idx, 1);
			state.statPoolKeys.splice(idx, 1);
		}
		rebuildPoolKeys(state);
		state.selectedPoolValue = null;
		state.selectedPoolKey = null;
		return state;
	}

	if (newVal !== null) {
		// Assign new value to empty stat
		state.stats[statKey] = newVal;
		const idx = state.statPool.indexOf(newVal);
		if (idx >= 0) {
			state.statPool.splice(idx, 1);
			state.statPoolKeys.splice(idx, 1);
		}
		rebuildPoolKeys(state);
		state.selectedPoolValue = null;
		state.selectedPoolKey = null;
		return state;
	}

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
 * Record an OR-group choice (e.g., Fox picks Ambush over Skill at Arms).
 */
function setOrChoice(userId, groupIdx, moveName) {
	const state = getWizard(userId);
	if (!state) return null;
	if (!state.orChoices) state.orChoices = {};
	state.orChoices[groupIdx] = moveName;
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

	case 'stats': {
		const allAssigned = Object.values(state.stats).every(v => v !== null);
		return {
			type: 'stats_picker',
			stats: state.stats,
			pool: state.statPool,
			poolKeys: state.statPoolKeys,
			allAssigned,
			selectedPoolValue: state.selectedPoolValue,
			selectedPoolKey: state.selectedPoolKey,
		};
	}

	case 'moves': {
		const rules = pb.creationRules;
		const alreadyGranted = new Set([...state.grantedMoves, ...Object.keys(pb.startingMoves)]);
		const orSelected = new Set(Object.values(state.orChoices || {}));

		const available = [];
		for (const [moveName, moveData] of Object.entries(pb.allMoves || {})) {
			if (alreadyGranted.has(moveName)) continue;
			if (orSelected.has(moveName)) continue;
			if (moveData.starred) continue;
			available.push({ name: moveName, text: moveData.text });
		}

		const maxPicks = rules.startingPickCount || 0;

		return {
			type: 'moves_picker',
			autoGranted: [...state.grantedMoves, ...Object.keys(pb.startingMoves)],
			orChoices: rules.orGroups || null,
			orSelections: state.orChoices || {},
			available,
			maxPicks,
			currentPicks: state.chosenMoves.length,
			chosenMoves: state.chosenMoves,
			// Include full move data for description rendering
			allMovesData: pb.allMoves || {},
		};
	}

	case 'confirm': {
		const statNames = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
		const statLine = Object.entries(state.stats).map(([k, v]) => `${statNames[k]}: ${v !== null ? v : '—'}`).join('  |  ');
		return {
			type: 'confirm',
			name: state.name,
			playbook: pb.name,
			background: state.background,
			instinct: state.instinct,
			stats: state.stats,
			statLine,
			autoGrantedMoves: [...state.grantedMoves, ...Object.keys(pb.startingMoves), ...Object.values(state.orChoices || {})].filter(Boolean),
			pickedMoves: state.chosenMoves,
			allMoves: [...state.grantedMoves, ...Object.keys(pb.startingMoves), ...Object.values(state.orChoices || {}).filter(Boolean), ...state.chosenMoves],
			allMovesData: pb.allMoves || {},
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

	if (state.step === 'stats') {
		const allAssigned = Object.values(state.stats).every(v => v !== null);
		if (!allAssigned) return getStepInfo(userId);
		state.step = 'moves';
		return getStepInfo(userId);
	}

	if (state.step === 'moves') {
		const hasOrGroups = rules.orGroups && rules.orGroups.length > 0;
		if (hasOrGroups) {
			const allFilled = rules.orGroups.every((g, i) => state.orChoices && state.orChoices[i]);
			if (!allFilled) return getStepInfo(userId);
		}
		state.step = 'confirm';
		return getStepInfo(userId);
	}

	// instinct -> stats is automatic (next step after any pick)
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
	case 'stats':
		state.instinct = null;
		state.stats = { str: null, dex: null, con: null, int: null, wis: null, cha: null };
		state.statPool = [];
		state.statPoolKeys = [];
		state.selectedPoolValue = null;
		state.selectedPoolKey = null;
		state.step = 'instinct';
		break;
	case 'moves':
		state.chosenMoves = [];
		state.orChoices = null;
		state.step = 'stats';
		break;
	case 'confirm':
		state.step = 'moves';
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
	selectPoolValue,
	assignStat,
	toggleMove,
	setOrChoice,
	getStepInfo,
	advanceStep,
	backStep,
};
