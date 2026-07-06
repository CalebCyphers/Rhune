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
 * Parse a small dice expression.
 * Supports:
 * - NdM / dM
 * - optional +K / -K modifier
 * - optional trailing mode token: adv|dis
 *
 * Examples:
 * - d20
 * - 2d6+1
 * - 4d8-2 adv
 *
 * Notes:
 * - We intentionally do NOT support multiple die types (e.g. 2d6+1d4).
 */
function parseDiceExpr(expr) {
	const raw = String(expr || '').trim().toLowerCase();
	// normalize internal whitespace, keep a single separator between tokens
	const normalized = raw.replace(/\s+/g, ' ').trim();

	// Split off optional trailing mode token.
	const parts = normalized.split(' ');
	let mode = null;
	let core = normalized;
	if (parts.length > 1) {
		const last = parts[parts.length - 1];
		if (last === 'adv' || last === 'dis') {
			mode = last;
			core = parts.slice(0, -1).join(' ');
		}
		else {
			// Any extra tokens are invalid.
			throw new Error(`Invalid dice expression: ${expr}`);
		}
	}

	const cleaned = core.replace(/\s+/g, '');
	const match = cleaned.match(/^(?<count>\d+)?d(?<sides>\d+)(?<mod>[+-]\d+)?$/);
	if (!match || !match.groups) {
		// Multi-die-type expressions will land here; we want a clear message.
		throw new Error('Invalid dice expression. Only a single die type is supported (e.g. 2d6+1).');
	}

	const count = match.groups.count ? Number.parseInt(match.groups.count, 10) : 1;
	const sides = Number.parseInt(match.groups.sides, 10);
	const modifier = match.groups.mod ? Number.parseInt(match.groups.mod, 10) : 0;

	if (!Number.isInteger(count) || count < 1 || count > 100) {
		throw new Error(`Invalid dice count: ${count}`);
	}

	return { raw: normalized, cleaned, count, sides, modifier, mode };
}

/**
 * Roll a generic dice expression.
 *
 * If mode is adv/dis (or the expression ends with "adv"/"dis") and the
 * expression contains a single die type, roll one extra die and drop:
 * - adv: drop the lowest single die
 * - dis: drop the highest single die
 */
function applyAdvDis(rolls, mode) {
	if (!mode || mode === 'normal') {
		return { kept: rolls.slice(), droppedIndex: null };
	}
	if (mode !== 'adv' && mode !== 'dis') {
		throw new Error(`Invalid mode: ${mode}`);
	}

	const kept = rolls.slice();
	const dropValue = mode === 'adv' ? Math.min(...kept) : Math.max(...kept);
	const droppedIndex = kept.indexOf(dropValue);
	kept.splice(droppedIndex, 1);

	return { kept, droppedIndex };
}

function rollExpr(expr, modeOverride = null) {
	const parsed = parseDiceExpr(expr);
	const mode = modeOverride || parsed.mode || 'normal';

	const diceCount = mode !== 'normal' ? parsed.count + 1 : parsed.count;
	const rolls = Array.from({ length: diceCount }, () => rollDie(parsed.sides));

	const { kept, droppedIndex } = applyAdvDis(rolls, mode);

	const subtotal = kept.reduce((a, b) => a + b, 0);
	const total = subtotal + parsed.modifier;

	return {
		type: 'expr',
		expr: parsed.cleaned,
		raw: parsed.raw,
		mode,
		count: parsed.count,
		sides: parsed.sides,
		rolls,
		kept,
		droppedIndex,
		modifier: parsed.modifier,
		subtotal,
		total,
	};
}

/**
 * Roll 2d6 with optional advantage/disadvantage.
 * - normal: 2d6
 * - adv/dis: 3d6 drop low/high
 */
function roll2d6(mode = 'normal') {
	const m = mode || 'normal';
	if (!['normal', 'adv', 'dis'].includes(m)) {
		throw new Error(`Invalid mode: ${mode}`);
	}

	const diceCount = m === 'normal' ? 2 : 3;
	const rolls = Array.from({ length: diceCount }, () => rollDie(6));
	const { kept, droppedIndex } = applyAdvDis(rolls, m);
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
