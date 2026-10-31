// Unit tests for lib/edit_ops.js — the pure record -> patch logic behind the
// sheet Edit view (max HP, traits, moves).

const test = require('node:test');
const assert = require('node:assert/strict');

const editOps = require('../../lib/edit_ops');

function makeRecord(overrides = {}) {
	return {
		id: 'char1',
		name: 'Korina',
		playbook: 'fox',
		hp: 20,
		hp_max: 20,
		xp: 0,
		choices: {
			playbook: 'fox',
			traits: [
				{ name: 'CATFALL', text: 'You always land on your feet.', improved: false, superior: false },
			],
			chosen_moves: ['Ambush', 'Feint'],
		},
		...overrides,
	};
}

// --- adjustMaxHp ------------------------------------------------------------

test('adjustMaxHp raises max hp', () => {
	const r = editOps.adjustMaxHp(makeRecord(), 1);
	assert.equal(r.patch.hp_max, 21);
	assert.equal(r.patch.hp, undefined);
	assert.match(r.message, /20 -> 21/);
});

test('adjustMaxHp lowers max hp and caps current hp down', () => {
	const r = editOps.adjustMaxHp(makeRecord({ hp: 20, hp_max: 20 }), -1);
	assert.equal(r.patch.hp_max, 19);
	assert.equal(r.patch.hp, 19);
});

test('adjustMaxHp floors at the minimum', () => {
	const r = editOps.adjustMaxHp(makeRecord({ hp_max: 1 }), -1);
	assert.ok(r.error);
});

test('adjustMaxHp caps at the ceiling', () => {
	const r = editOps.adjustMaxHp(makeRecord({ hp_max: 30 }), 1);
	assert.ok(r.error);
});

// --- traits -----------------------------------------------------------------

test('addTrait adds a catalog trait', () => {
	const r = editOps.addTrait(makeRecord(), 'KEEN NOSE');
	assert.equal(r.patch.choices.traits.length, 2);
	assert.equal(r.patch.choices.traits[1].name, 'KEEN NOSE');
	assert.match(r.message, /Added trait/);
});

test('addTrait rejects a duplicate', () => {
	const r = editOps.addTrait(makeRecord(), 'CATFALL');
	assert.ok(r.error);
});

test('addTrait rejects an unknown name', () => {
	const r = editOps.addTrait(makeRecord(), 'NO SUCH TRAIT');
	assert.ok(r.error);
});

test('addCustomTrait adds freeform trait', () => {
	const r = editOps.addCustomTrait(makeRecord(), 'BLOOD OF THE OLD OAK', 'You can talk to trees.');
	assert.equal(r.patch.choices.traits.length, 2);
	assert.equal(r.patch.choices.traits[1].name, 'BLOOD OF THE OLD OAK');
});

test('addCustomTrait requires name and text', () => {
	assert.ok(editOps.addCustomTrait(makeRecord(), '', 'text').error);
	assert.ok(editOps.addCustomTrait(makeRecord(), 'Name', '').error);
});

test('addCustomTrait rejects duplicates (case-insensitive)', () => {
	const r = editOps.addCustomTrait(makeRecord(), 'catfall', 'dup');
	assert.ok(r.error);
});

test('removeTrait removes an existing trait', () => {
	const r = editOps.removeTrait(makeRecord(), 'CATFALL');
	assert.equal(r.patch.choices.traits.length, 0);
	assert.match(r.message, /Removed trait/);
});

test('removeTrait errors when missing', () => {
	const r = editOps.removeTrait(makeRecord(), 'KEEN NOSE');
	assert.ok(r.error);
});

// --- moves ------------------------------------------------------------------

test('addMove adds a playbook move', () => {
	const r = editOps.addMove(makeRecord(), 'Danger Sense');
	assert.ok(r.patch.choices.chosen_moves.includes('Danger Sense'));
	assert.equal(r.patch.choices.chosen_moves.length, 3);
});

test('addMove rejects a duplicate', () => {
	const r = editOps.addMove(makeRecord(), 'Ambush');
	assert.ok(r.error);
});

test('addMove rejects a move from another playbook', () => {
	// 'Well-Read' is a Judge move, not Fox.
	const r = editOps.addMove(makeRecord(), 'Well-Read');
	assert.ok(r.error);
});

test('addMove rejects when character has no playbook', () => {
	const r = editOps.addMove(makeRecord({ playbook: null }), 'Ambush');
	assert.ok(r.error);
});

test('removeMove removes an existing move', () => {
	const r = editOps.removeMove(makeRecord(), 'Feint');
	assert.deepEqual(r.patch.choices.chosen_moves, ['Ambush']);
});

test('removeMove errors when missing', () => {
	const r = editOps.removeMove(makeRecord(), 'Danger Sense');
	assert.ok(r.error);
});
