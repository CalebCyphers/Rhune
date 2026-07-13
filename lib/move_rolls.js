// Explicit mapping for move rolls.
// This is the source of truth for which stat modifier applies to which move.
//
// - Keys are move names as shown to players.
// - Value is one of: "str"|"dex"|"con"|"int"|"wis"|"cha"|"none".
// - If a move can roll different stats depending on fiction, we should model
//   that explicitly later (e.g. value: ["str","dex"] + prompt).

const MOVE_ROLL_STAT = {
	// Basic Moves
	'Clash': 'str',
	'Defend': 'con',
	'Know Things': 'int',
	'Let Fly': 'dex',
	'Persuade': 'cha',
	'Seek Insight': 'wis',
	
	// TODO: fill in remaining basics (Defy Danger is situational; Aid/Interfere etc. are special)
};

function statLabel(statKey) {
	const map = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA', none: 'nothing' };
	return map[statKey] || String(statKey || '');
}

module.exports = {
	MOVE_ROLL_STAT,
	statLabel,
};
