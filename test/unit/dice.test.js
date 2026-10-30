const assert = require('node:assert/strict');

// Purpose: lock down dice parsing + the push-your-luck pool mechanic.
// Mostly pure logic (no Discord/PocketBase), so it stays fast; the random
// rolls are checked for bounded invariants rather than exact values.
const {
	parseDiceExpr,
	rollExpr,
	rollPool,
	poolFromRolls,
	rollCommunity,
	applyAdvDis,
	rollDie,
	POOL_MAX,
} = require('../../lib/dice');

function assertInRange(n, min, max, msg) {
	assert.ok(Number.isInteger(n), msg || `Expected integer, got ${n}`);
	assert.ok(n >= min && n <= max, msg || `Expected ${n} in [${min}, ${max}]`);
}

// ── Parsing (deterministic) ──────────────────────────────────
{
	const p = parseDiceExpr('d20');
	assert.deepStrictEqual(
		{ count: p.count, sides: p.sides, modifier: p.modifier, mode: p.mode, cleaned: p.cleaned },
		{ count: 1, sides: 20, modifier: 0, mode: null, cleaned: 'd20' },
	);
}

{
	const p = parseDiceExpr('2d6+1');
	assert.deepStrictEqual(
		{ count: p.count, sides: p.sides, modifier: p.modifier, mode: p.mode, cleaned: p.cleaned },
		{ count: 2, sides: 6, modifier: 1, mode: null, cleaned: '2d6+1' },
	);
}

{
	const p = parseDiceExpr('4d8-2 adv');
	assert.deepStrictEqual(
		{ count: p.count, sides: p.sides, modifier: p.modifier, mode: p.mode, cleaned: p.cleaned },
		{ count: 4, sides: 8, modifier: -2, mode: 'adv', cleaned: '4d8-2' },
	);
}

// ── Expression rolls (bounded) ───────────────────────────────
{
	const r = rollExpr('2d6+1');
	assert.equal(r.type, 'expr');
	assert.equal(r.sides, 6);
	assert.equal(r.count, 2);
	assert.equal(r.modifier, 1);
	assert.equal(r.mode, 'normal');
	assert.equal(r.rolls.length, 2);
	r.rolls.forEach(v => assertInRange(v, 1, 6));
	assertInRange(r.subtotal, 2, 12);
	assertInRange(r.total, 3, 13);
}

{
	const r = rollExpr('d20', 'adv');
	assert.equal(r.mode, 'adv');
	assert.equal(r.rolls.length, 2);
	assert.equal(r.kept.length, 1);
	r.rolls.forEach(v => assertInRange(v, 1, 20));
	assertInRange(r.total, 1, 20);
}

// ── applyAdvDis ──────────────────────────────────────────────
{
	// advantage drops the lowest
	const { kept, droppedIndex } = applyAdvDis([2, 5, 6], 'adv');
	assert.deepStrictEqual(kept, [5, 6]);
	assert.equal(droppedIndex, 0);
}
{
	// disadvantage drops the highest
	const { kept, droppedIndex } = applyAdvDis([2, 5, 6], 'dis');
	assert.deepStrictEqual(kept, [2, 5]);
	assert.equal(droppedIndex, 2);
}
{
	// normal keeps everything, drops nothing
	const { kept, droppedIndex } = applyAdvDis([2, 5, 6], 'normal');
	assert.deepStrictEqual(kept, [2, 5, 6]);
	assert.equal(droppedIndex, null);
}

// ── Pool rolls (push your luck) ──────────────────────────────
{
	const r = rollPool({ count: 3 });
	assert.equal(r.type, 'pool');
	assert.equal(r.count, 3);
	assert.equal(r.sides, 6);
	assert.equal(r.mode, 'normal');
	assert.equal(r.rolls.length, 3);
	assert.equal(r.kept.length, 3);
	r.rolls.forEach(v => assertInRange(v, 1, 6));

	// Band invariants
	assert.equal(r.ones, r.kept.filter(v => v === 1).length);
	assert.equal(r.sixes, r.kept.filter(v => v === 6).length);
	assert.equal(r.bust, r.ones > 0);
	if (r.bust) assert.equal(r.band, 'bust');
	else if (r.sixes > 0) assert.equal(r.band, 'success6');
	else assert.equal(r.band, 'success');
}

{
	// advantage rolls one extra die but the pool size stays put
	const r = rollPool({ count: 3, mode: 'adv' });
	assert.equal(r.count, 3);
	assert.equal(r.rolls.length, 4);
	assert.equal(r.kept.length, 3);
	assert.notEqual(r.droppedIndex, null);
}

{
	// pool size bounds
	assert.throws(() => rollPool({ count: 0 }), /Invalid pool size/);
	assert.throws(() => rollPool({ count: POOL_MAX + 1 }), /Invalid pool size/);
	assert.throws(() => rollPool({ count: 2, mode: 'bogus' }), /Invalid mode/);
}

// ── poolFromRolls (used by the reroll) ───────────────────────
{
	// a reroll that clears the 1 becomes a clean success
	const r = poolFromRolls([5, 3, 6]);
	assert.equal(r.bust, false);
	assert.equal(r.ones, 0);
	assert.equal(r.sixes, 1);
	assert.equal(r.band, 'success6');
	assert.equal(r.count, 3);
}
{
	const r = poolFromRolls([1, 4]);
	assert.equal(r.bust, true);
	assert.equal(r.ones, 1);
	assert.equal(r.band, 'bust');
}

// ── Community rolls (Nd6, take highest) ──────────────────────
{
	const r = rollCommunity({ count: 3 });
	assert.equal(r.type, 'community');
	assert.equal(r.count, 3);
	assert.equal(r.spent, false);
	assert.equal(r.rolls.length, 3);
	r.rolls.forEach(v => assertInRange(v, 1, 6));
	assert.equal(r.result, Math.max(...r.rolls));
	assert.equal(r.rolls[r.resultIndex], r.result);
	const expectedBand = r.result === 6 ? 'best' : (r.result >= 4 ? 'mixed' : 'bad');
	assert.equal(r.band, expectedBand);
}

{
	// a spent community (0) rolls 2d6 and takes the lowest
	const r = rollCommunity({ count: 0 });
	assert.equal(r.spent, true);
	assert.equal(r.rolls.length, 2);
	assert.equal(r.result, Math.min(...r.rolls));
}

{
	// disadvantage takes the lowest of the extra die
	const r = rollCommunity({ count: 3, mode: 'dis' });
	assert.equal(r.rolls.length, 4);
	assert.equal(r.result, Math.min(...r.rolls));
}

// ── rollDie bounds ───────────────────────────────────────────
{
	for (let i = 0; i < 50; i++) assertInRange(rollDie(6), 1, 6);
	assert.throws(() => rollDie(0), /Invalid die sides/);
}
