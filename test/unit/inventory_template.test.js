const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOutfitTemplate } = require('../../lib/inventory_template');

// Discord message hard limit for a normal message.
const DISCORD_MESSAGE_LIMIT = 2000;

// Purpose: the /outfit template must (1) fit in a single Discord message so the
// player can reply to it and save it, and (2) still convey the key instructional
// info from the printed insert (load rules, supplies, Have What You Need, etc.).
test('outfit template: fits within Discord message limit', () => {
	const template = buildOutfitTemplate();
	assert.ok(
		template.length <= DISCORD_MESSAGE_LIMIT,
		`Outfit template is ${template.length} chars; must be <= ${DISCORD_MESSAGE_LIMIT}`,
	);
});

// Has no code-block wrapper (renders as plain markdown).
test('outfit template: is plain markdown, not a code block', () => {
	const template = buildOutfitTemplate();
	assert.ok(!template.includes('```'), 'Template should not contain a code block fence');
});

// Load budget guidance is present.
test('outfit template: includes light/normal/heavy load guidance', () => {
	const template = buildOutfitTemplate();
	assert.match(template, /Light/);
	assert.match(template, /Normal/);
	assert.match(template, /Heavy/);
});

// The core "Have What You Need" instruction is present (both big + small items).
test('outfit template: includes Have What You Need instructions', () => {
	const template = buildOutfitTemplate();
	const matches = (template.match(/Have What You Need/g) || []).length;
	assert.ok(matches >= 2, `Expected at least 2 "Have What You Need" references, got ${matches}`);
});

// Supplies + Prosperity info present.
test('outfit template: includes supplies uses + prosperity info', () => {
	const template = buildOutfitTemplate();
	assert.match(template, /4\+Prosperity uses/);
	assert.match(template, /Prosperity/);
});

// Uses the ☑ / ☐ marking characters chosen for the design.
test('outfit template: uses ☑/☐ mark characters', () => {
	const template = buildOutfitTemplate();
	assert.match(template, /☑/);
	assert.match(template, /☐/);
});
