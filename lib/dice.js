const { chance } = require('./id');

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

// ---------------------------------------------------------------------------
// Generic dice expressions (d20, 2d6+1, 4d8-2, …)
// ---------------------------------------------------------------------------

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
	const normalized = raw.replace(/\s+/g, ' ').trim();

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
			throw new Error(`Invalid dice expression: ${expr}`);
		}
	}

	const cleaned = core.replace(/\s+/g, '');
	const match = cleaned.match(/^(?<count>\d+)?d(?<sides>\d+)(?<mod>[+-]\d+)?$/);
	if (!match || !match.groups) {
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
 * Apply advantage/disadvantage to a set of rolls: roll an extra die and drop
 * the lowest (adv) or highest (dis). Returns the kept dice + dropped index.
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

// ---------------------------------------------------------------------------
// Push your luck — the core mechanic
// ---------------------------------------------------------------------------

const POOL_MAX = 20;

/** Derive a pool result from a set of kept dice (shared by roll + reroll). */
function poolFromRolls(kept, { count = kept.length, mode = 'normal', rolls = kept, droppedIndex = null } = {}) {
	const ones = kept.filter(v => v === 1).length;
	const sixes = kept.filter(v => v === 6).length;
	const bust = ones > 0;
	const band = bust ? 'bust' : (sixes > 0 ? 'success6' : 'success');
	return { type: 'pool', count, mode, sides: 6, rolls, kept, droppedIndex, ones, sixes, bust, band };
}

/**
 * Roll a push-your-luck pool of d6.
 *
 * Your pool starts at 1 die and grows by 1 for each RISKY move you trigger in
 * a turn — so this just rolls however many dice it's told.
 *
 * - **Bust:** any die shows a 1.
 * - **Success:** no die shows a 1.
 * - **Success with a 6:** no 1s, and at least one 6.
 *
 * Advantage/disadvantage: roll one extra die and drop the lowest (adv) or the
 * highest (dis) — the pool size stays put, you just shed a die.
 *
 * @param {object} opts
 * @param {number} [opts.count=1]  number of dice in the pool
 * @param {string} [opts.mode]     'normal' | 'adv' | 'dis'
 */
function rollPool({ count = 1, mode = 'normal' } = {}) {
	const n = Number.parseInt(count, 10);
	if (!Number.isInteger(n) || n < 1 || n > POOL_MAX) {
		throw new Error(`Invalid pool size: ${count} (1–${POOL_MAX})`);
	}
	const m = mode || 'normal';
	if (!['normal', 'adv', 'dis'].includes(m)) {
		throw new Error(`Invalid mode: ${mode}`);
	}

	const diceCount = m === 'normal' ? n : n + 1;
	const rolls = Array.from({ length: diceCount }, () => rollDie(6));
	const { kept, droppedIndex } = applyAdvDis(rolls, m);

	return poolFromRolls(kept, { count: n, mode: m, rolls, droppedIndex });
}

/**
 * Roll on the community's behalf: roll a number of d6 equal to the stat and
 * take the highest. At 0 the stat is spent — roll 2d6 and take the lowest.
 *
 * - 6      → it goes as well as it can.
 * - 4–5    → it works, with a cost or catch.
 * - 1–3    → it goes badly (the GM makes a hard move).
 *
 * Advantage: one extra die (take highest). Disadvantage: one extra die, take
 * the lowest instead.
 */
function rollCommunity({ count = 0, mode = 'normal' } = {}) {
	const n = Number.parseInt(count, 10);
	if (!Number.isInteger(n) || n < 0 || n > POOL_MAX) {
		throw new Error(`Invalid stat value: ${count} (0–${POOL_MAX})`);
	}
	const m = mode || 'normal';
	if (!['normal', 'adv', 'dis'].includes(m)) {
		throw new Error(`Invalid mode: ${mode}`);
	}

	// At 0: roll 2d6, take the lowest (the steading is broken in this regard).
	const spent = n === 0;
	const base = spent ? 2 : n;
	const diceCount = spent ? 2 : (m === 'normal' ? n : n + 1);
	const rolls = Array.from({ length: diceCount }, () => rollDie(6));

	// Take highest normally; lowest when disadvantage or when the stat is spent.
	const takeLow = spent || m === 'dis';
	const result = takeLow ? Math.min(...rolls) : Math.max(...rolls);
	const resultIndex = rolls.indexOf(result);

	const band = result === 6 ? 'best' : (result >= 4 ? 'mixed' : 'bad');

	return {
		type: 'community',
		count: n,
		mode: m,
		sides: 6,
		spent,
		rolls,
		result,
		resultIndex,
		band,
		base,
	};
}

module.exports = {
	rollDie,
	parseDiceExpr,
	rollExpr,
	applyAdvDis,
	rollPool,
	poolFromRolls,
	rollCommunity,
	POOL_MAX,
};
