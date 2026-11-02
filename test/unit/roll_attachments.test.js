const test = require('node:test');
const assert = require('node:assert/strict');

// Purpose: lock down which graphic a roll gets. A lone die shows its face as a
// thumbnail; anything with more than one die (advantage/disadvantage, or a
// genuine multi-die roll) must render a strip so the dropped die is visible.
// Regression: 1d20 adv/dis used to hit the single-face thumbnail branch and
// show only rolls[0] — the die that was actually dropped.
const rollCommand = require('../../commands/roll');
const { exprResultEmbed } = require('../../lib/format');

async function attachFor(result) {
	const embed = exprResultEmbed(result);
	const payload = await rollCommand.buildReply(embed, result, []);
	return { embed, payload };
}

test('lone die shows its face as a thumbnail', async () => {
	const result = { type: 'expr', count: 1, sides: 20, mode: 'normal', rolls: [7], kept: [7], droppedIndex: null, modifier: 0 };
	const { embed, payload } = await attachFor(result);
	assert.equal(embed.data.thumbnail?.url, 'attachment://d20-7.png');
	assert.ok(!embed.data.image, 'lone die should not set a strip image');
	assert.equal(payload.files.length, 1);
});

test('1d20 with advantage renders a strip (not the dropped face)', async () => {
	const result = { type: 'expr', count: 1, sides: 20, mode: 'adv', rolls: [11, 12], kept: [12], droppedIndex: 0, modifier: 0 };
	const { embed, payload } = await attachFor(result);
	assert.equal(embed.data.image?.url, 'attachment://roll.png');
	assert.ok(!embed.data.thumbnail, 'adv/dis must not use the single-face thumbnail');
	assert.equal(payload.files.length, 1);
});

test('1d8 with disadvantage renders a strip', async () => {
	const result = { type: 'expr', count: 1, sides: 8, mode: 'dis', rolls: [6, 2], kept: [2], droppedIndex: 0, modifier: 0 };
	const { embed, payload } = await attachFor(result);
	assert.equal(embed.data.image?.url, 'attachment://roll.png');
	assert.ok(!embed.data.thumbnail, 'disadvantage must not use the single-face thumbnail');
	assert.equal(payload.files.length, 1);
});

test('a genuine multi-die roll renders a strip', async () => {
	const result = { type: 'expr', count: 3, sides: 6, mode: 'normal', rolls: [2, 5, 3], kept: [2, 5, 3], droppedIndex: null, modifier: 0 };
	const { embed, payload } = await attachFor(result);
	assert.equal(embed.data.image?.url, 'attachment://roll.png');
	assert.ok(!embed.data.thumbnail);
	assert.equal(payload.files.length, 1);
});
