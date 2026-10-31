const test = require('node:test');
const assert = require('node:assert/strict');

const { balanceEmphasis, cutMarkdown } = require('../../lib/format');

// Regression: a cut that lands mid-bold left an unclosed `**`, and Discord then
// carried the bold onto everything after it. These lock the fix down.

function boldCount(s) {
	return (String(s).match(/\*\*/g) || []).length;
}

test('balanceEmphasis: leaves already-balanced text alone', () => {
	assert.equal(balanceEmphasis('plain text'), 'plain text');
	assert.equal(balanceEmphasis('already **bold** here'), 'already **bold** here');
	assert.equal(balanceEmphasis('**a** and **b**'), '**a** and **b**');
});

test('balanceEmphasis: strips the dangling opener when a cut lands mid-bold', () => {
	const out = balanceEmphasis('some text and **roll');
	assert.equal(out, 'some text and roll');
	assert.equal(boldCount(out) % 2, 0);
});

test('balanceEmphasis: removes only the last unmatched marker', () => {
	// Two openers, one closer → drop the final opener, keep the earlier pair.
	const out = balanceEmphasis('**Keep** this and **drop');
	assert.equal(out, '**Keep** this and drop');
	assert.equal(boldCount(out) % 2, 0);
});

test('cutMarkdown: never returns an odd number of ** markers', () => {
	const samples = [
		"When you imbue a holy light with Helior's power, choose an Invocation you know and **roll +WIS.**",
		'When you brandish a holy light to turn aside an attack against body, mind, or soul, **roll.**',
		'When you take your time and calmly line up the perfect shot, either deal your damage or **pick 1:**',
		'**Lead** with bold, then more text that runs long enough to get cut somewhere in the middle here',
		'no emphasis at all, just a long sentence that will be truncated partway through',
	];
	for (const s of samples) {
		for (const limit of [40, 60, 90, 150]) {
			const out = cutMarkdown(s, limit);
			assert.equal(boldCount(out) % 2, 0, `unbalanced bold for limit ${limit}: ${out}`);
		}
	}
});

test('cutMarkdown: respects the limit and does not pad short text', () => {
	assert.equal(cutMarkdown('short', 100), 'short');
	assert.ok(cutMarkdown('x'.repeat(500), 100).length <= 100);
});
