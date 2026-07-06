const Chance = require('chance');

const chance = new Chance();

/**
 * Roll a single die with N sides.
 * @param {number} sides
 */
function rollDie(sides) {
	if (!Number.isInteger(sides) || sides < 1) {
		throw new Error(`Invalid die sides: ${sides}`);
	}
	return chance.integer({ min: 1, max: sides });
}

/**
 * Parse very small dice expressions.
 * Supports: NdM, dM, optional +K / -K modifier
 * Examples: d20, 2d6+1, 4d8-2
 */
function parseDiceExpr(expr) {
	const cleaned = String(expr || '').trim().toLowerCase().replace(/\s+/g, '');
	const match = cleaned.match(/^(?<count>\d+)?d(?<sides>\d+)(?<mod>[+-]\d+)?$/);
	if (!match || !match.groups) {
		throw new Error(`Invalid dice expression: ${expr}`);
	}

	const count = match.groups.count ? Number.parseInt(match.groups.count, 10) : 1;
	const sides = Number.parseInt(match.groups.sides, 10);
	const modifier = match.groups.mod ? Number.parseInt(match.groups.mod, 10) : 0;

	if (!Number.isInteger(count) || count < 1 || count > 100) {
		throw new Error(`Invalid dice count: ${count}`);
	}

	return { cleaned, count, sides, modifier };
}

/**
 * Roll a generic dice expression.
 */
function rollExpr(expr) {
	const parsed = parseDiceExpr(expr);
	const rolls = Array.from({ length: parsed.count }, () => rollDie(parsed.sides));
	const subtotal = rolls.reduce((a, b) => a + b, 0);
	const total = subtotal + parsed.modifier;

	return {
		type: 'expr',
		expr: parsed.cleaned,
		count: parsed.count,
		sides: parsed.sides,
		rolls,
		modifier: parsed.modifier,
		subtotal,
		total,
	};
}

/**
 * Roll 2d6 with optional advantage/disadvantage.
 * - normal: 2d6
 * - adv: 3d6 drop lowest
 * - dis: 3d6 drop highest
 */
function roll2d6(mode = 'normal') {
	const m = mode || 'normal';
	if (!['normal', 'adv', 'dis'].includes(m)) {
		throw new Error(`Invalid mode: ${mode}`);
	}

	const diceCount = m === 'normal' ? 2 : 3;
	const rolls = Array.from({ length: diceCount }, () => rollDie(6));

	const kept = rolls.slice();
	let droppedIndex = null;

	if (m === 'adv') {
		// drop the lowest
		droppedIndex = kept.indexOf(Math.min(...kept));
		kept.splice(droppedIndex, 1);
	}
	if (m === 'dis') {
		// drop the highest
		droppedIndex = kept.indexOf(Math.max(...kept));
		kept.splice(droppedIndex, 1);
	}

	const total = kept.reduce((a, b) => a + b, 0);

	return {
		type: '2d6',
		mode: m,
		rolls,
		kept,
		droppedIndex,
		total,
	};
}

/**
 * Die of Fate: d6, high is good.
 */
function rollFate() {
	const roll = rollDie(6);
	let outcome = 'mixed';
	if (roll <= 2) outcome = 'bad';
	if (roll >= 5) outcome = 'good';
	return { type: 'fate', roll, outcome };
}

module.exports = {
	parseDiceExpr,
	rollExpr,
	roll2d6,
	rollFate,
};
