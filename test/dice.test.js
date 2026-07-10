const assert = require('assert');

const { parseDiceExpr, rollExpr, roll2d6, rollFate } = require('../lib/dice');

function assertInRange(n, min, max, msg) {
	assert.ok(Number.isInteger(n), msg || `Expected integer, got ${n}`);
	assert.ok(n >= min && n <= max, msg || `Expected ${n} in [${min}, ${max}]`);
}

// Parsing tests (deterministic)
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

// Roll structure + range tests (non-deterministic, but bounded)
{
	const r = rollExpr('2d6+1');
	assert.strictEqual(r.type, 'expr');
	assert.strictEqual(r.sides, 6);
	assert.strictEqual(r.count, 2);
	assert.strictEqual(r.modifier, 1);
	assert.strictEqual(r.mode, 'normal');
	assert.strictEqual(r.rolls.length, 2);
	r.rolls.forEach(v => assertInRange(v, 1, 6));
	assertInRange(r.subtotal, 2, 12);
	assertInRange(r.total, 3, 13);
}

{
	const r = rollExpr('d20', 'adv');
	assert.strictEqual(r.mode, 'adv');
	assert.strictEqual(r.rolls.length, 2);
	assert.strictEqual(r.kept.length, 1);
	r.rolls.forEach(v => assertInRange(v, 1, 20));
	assertInRange(r.total, 1, 20);
}

{
	const r = roll2d6('dis');
	assert.strictEqual(r.type, '2d6');
	assert.strictEqual(r.mode, 'dis');
	assert.strictEqual(r.rolls.length, 3);
	assert.strictEqual(r.kept.length, 2);
	r.rolls.forEach(v => assertInRange(v, 1, 6));
	assertInRange(r.total, 2, 12);
}

{
	const r = rollFate();
	assert.strictEqual(r.type, 'fate');
	assertInRange(r.roll, 1, 6);
	assert.ok(['bad', 'mixed', 'good'].includes(r.outcome));
}

console.log('dice.test.js passed');
