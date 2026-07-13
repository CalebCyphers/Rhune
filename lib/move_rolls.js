// Explicit mapping for move rolls.
// This is the source of truth for which stat modifier applies to which move.
//
// - Keys are move names as shown to players.
// - Value is one of: "str"|"dex"|"con"|"int"|"wis"|"cha"|"none".
// - If a move can roll different stats depending on fiction, we should model
//   that explicitly later (e.g. value: ["str","dex"] + prompt).
// - Return null/undefined when a move is not rollable (or unknown).

const MOVE_ROLL_STAT = {
	// Basic Moves
	'Clash': 'str',
	'Defend': 'con',
	'Know Things': 'int',
	'Let Fly': 'dex',
	'Persuade': 'cha',
	'Seek Insight': 'wis',

	// Expedition/Homefront etc.
	'Forage': 'wis',

	// Playbook: The Blessed
	'Amulets & Talismans': 'int',
	'Borrow Power': 'wis',
	'Danu\'s Grasp': 'wis',
	'Veil': 'int',
	'Wards & Bindings': 'int',
	'Suck the Poison Out': 'wis',
	'Nature\'s Wrath': 'wis',

	// Special
	'Death\'s Door': 'none',

	// TODO: fill in remaining basics (Defy Danger is situational; Aid/Interfere/Keep Company etc. may need special handling)
	// TODO: map Fox, Heavy, Judge, Lightbearer, Marshal, Ranger, Seeker, Would-be-Hero
};

function statLabel(statKey) {
	const map = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA', none: 'nothing' };
	return map[statKey] || String(statKey || '');
}

function getMoveRollStat(moveName) {
	if (!moveName) return null;
	return MOVE_ROLL_STAT[String(moveName)] || null;
}

function getStatMod(stats, statKey) {
	if (!statKey || statKey === 'none') return 0;
	const s = stats || {};
	const raw = s[statKey];
	const n = typeof raw === 'number' ? raw : Number.parseInt(raw, 10);
	return Number.isFinite(n) ? n : 0;
}

module.exports = {
	MOVE_ROLL_STAT,
	getMoveRollStat,
	getStatMod,
	statLabel,
};
