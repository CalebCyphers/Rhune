const { EmbedBuilder } = require('discord.js');

function escapeFilterValue(v) {
	return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * If a string has an odd number of `**` markers, the last is an unclosed bold
 * opener (a cut landed mid-bold). Strip it so Discord doesn't carry the emphasis
 * onto everything that follows in the embed.
 */
function balanceEmphasis(s) {
	const str = String(s);
	const count = (str.match(/\*\*/g) || []).length;
	if (count % 2 === 0) return str;
	const idx = str.lastIndexOf('**');
	return `${str.slice(0, idx)}${str.slice(idx + 2)}`.trimEnd();
}

/**
 * Cut markdown text to a hard limit without leaving an unclosed `**` behind.
 * Use wherever a long, possibly-bold string is truncated for an embed.
 */
function cutMarkdown(text, limit) {
	const str = String(text ?? '');
	if (str.length <= limit) return balanceEmphasis(str);
	return balanceEmphasis(str.slice(0, limit));
}

function rollEmbed({ title, description, fields = [], footer }) {
	const embed = new EmbedBuilder().setTitle(title);
	if (description) embed.setDescription(description);
	if (fields.length) embed.addFields(fields);
	if (footer) embed.setFooter({ text: footer });
	return embed;
}

// ---------------------------------------------------------------------------
// Generic dice expressions (d20, 2d6+1, …) — unchanged numeric reading
// ---------------------------------------------------------------------------

function exprResultEmbed(result) {
	const modeLabel = result.mode && result.mode !== 'normal' ? ` (${result.mode})` : '';

	// Results only — no totals/subtotals, no "rolled c" line. The title carries
	// the expression (and any +N modifier) plus the mode; the dice are the point.
	const diceLine = result.rolls.map((v, i) => {
		const dropped = result.mode !== 'normal' && result.droppedIndex !== null && i === result.droppedIndex;
		return dropped ? `~~${v}~~` : String(v);
	}).join('  ');

	return rollEmbed({
		title: `Roll: ${result.expr}${modeLabel}`,
		description: diceLine,
	});
}

// ---------------------------------------------------------------------------
// Push your luck — the core mechanic. Renders the roll; the table reads the band.
// ---------------------------------------------------------------------------

/** Plain, color-free dice line: bold the 1s and 6s so they pop in text too. */
function poolDiceLine(result) {
	const parts = result.rolls.map((v, i) => {
		const dropped = result.droppedIndex !== null && i === result.droppedIndex;
		let s = String(v);
		if (dropped) s = `~~${s}~~`;
		else if (v === 1) s = `**${s}**`;
		else if (v === 6) s = `**${s}**`;
		return s;
	});
	return parts.join('  ');
}

function poolEmbed(result) {
	const modeLabel = result.mode === 'adv' ? ' (advantage)' : result.mode === 'dis' ? ' (disadvantage)' : '';
	const poolLabel = `${result.count}d6${modeLabel}`;

	// The dice graphic is the visual read-out; the text line rides along so the
	// result survives image-render failures, screen readers, and colorblind eyes.
	return rollEmbed({
		title: poolLabel,
		description: poolDiceLine(result),
	});
}

// ---------------------------------------------------------------------------
// Community rolls — Nd6, take the highest (6 / 4–5 / 1–3)
// ---------------------------------------------------------------------------

function communityEmbed(result) {
	const { rolls, result: top, mode, spent } = result;

	const modeLabel = mode === 'adv' ? ' (advantage)' : mode === 'dis' ? ' (disadvantage)' : '';
	const howMany = spent ? '2d6, lowest' : `${result.count}d6, highest`;
	const title = `🏘️ Community Roll — ${howMany}${modeLabel}`;

	const line = rolls.map((v, i) => {
		let s = String(v);
		if (i === result.resultIndex) s = `**${s}**`;
		return s;
	}).join('  ');

	return rollEmbed({
		title,
		description: `${line}\n\nResult: **${top}**`,
	});
}

module.exports = {
	escapeFilterValue,
	balanceEmphasis,
	cutMarkdown,
	exprResultEmbed,
	poolEmbed,
	communityEmbed,
};
