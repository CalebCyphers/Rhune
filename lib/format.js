const { EmbedBuilder } = require('discord.js');

function escapeFilterValue(v) {
	return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function rollEmbed({ title, description, fields = [], footer }) {
	const embed = new EmbedBuilder().setTitle(title);
	if (description) embed.setDescription(description);
	if (fields.length) embed.addFields(fields);
	embed.setTimestamp(new Date());
	if (footer) embed.setFooter({ text: footer });
	return embed;
}

function withRollId(embed, rollId) {
	if (!rollId) return embed;

	const existing = embed.data.footer?.text;
	const text = existing ? `${existing} • id: ${rollId}` : `id: ${rollId}`;
	embed.setFooter({ text });
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

	// The dice graphic carries the read-out; no numeric/notes lines here.
	return rollEmbed({
		title: `🎲 Push Your Luck — ${poolLabel}`,
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
	exprResultEmbed,
	poolEmbed,
	communityEmbed,
	withRollId,
};
