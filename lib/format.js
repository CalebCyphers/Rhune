const { EmbedBuilder } = require('discord.js');

function formatSigned(n) {
	if (!n) return '0';
	return n > 0 ? `+${n}` : String(n);
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

function exprResultEmbed(result) {
	const mod = result.modifier ? ` ${formatSigned(result.modifier)}` : '';
	const modeLabel = result.mode && result.mode !== 'normal' ? ` (${result.mode})` : '';

	let diceLine = result.rolls.join(', ');
	if (result.mode !== 'normal' && result.droppedIndex !== null) {
		const droppedVal = result.rolls[result.droppedIndex];
		diceLine = `${result.rolls.join(', ')} (dropped ${droppedVal})`;
	}

	return rollEmbed({
		title: `Roll: ${result.expr}${modeLabel}`,
		description: `Rolled **${result.count}d${result.sides}${mod}**`,
		fields: [
			{ name: 'Dice', value: diceLine, inline: true },
			{ name: 'Subtotal', value: String(result.subtotal), inline: true },
			{ name: 'Total', value: String(result.total), inline: true },
		],
	});
}

function twoD6Embed(result, modifier = 0) {
	const base = result.kept.reduce((a, b) => a + b, 0);
	const total = base + modifier;

	let diceLine = result.rolls.join(', ');
	if (result.mode !== 'normal' && result.droppedIndex !== null) {
		const droppedVal = result.rolls[result.droppedIndex];
		diceLine = `${result.rolls.join(', ')} (dropped ${droppedVal})`;
	}

	return rollEmbed({
		title: `Roll: 2d6${modifier ? formatSigned(modifier) : ''}`,
		description: result.mode === 'normal' ? 'Normal roll' : result.mode === 'adv' ? 'Advantage (3d6 keep best 2)' : 'Disadvantage (3d6 keep worst 2)',
		fields: [
			{ name: 'Dice', value: diceLine, inline: true },
			{ name: 'Base', value: String(base), inline: true },
			{ name: 'Total', value: String(total), inline: true },
		],
	});
}

function fateEmbed(result) {
	const label = result.outcome === 'good' ? 'Good' : result.outcome === 'bad' ? 'Bad' : 'Mixed';
	return rollEmbed({
		title: 'Die of Fate (d6)',
		description: `Rolled **${result.roll}** → **${label}**`,
	});
}

module.exports = {
	exprResultEmbed,
	twoD6Embed,
	fateEmbed,
	withRollId,
};
