const { EmbedBuilder } = require('discord.js');

const { listConditions } = require('./conditions_pb');
const { getTraits } = require('./traits');
// Inventory is intentionally *not* rendered on the main sheet.
// The Load/Outfit inventory insert is handled via /inv (playbook-style) UI.

function safeInline(v) {
	const s = String(v ?? '').trim();
	return s.length ? s : '—';
}

function formatTraitBlock(traits) {
	if (!traits.length) return '—';
	return traits.map(t => {
		const marks = [t.improved ? '★' : null, t.superior ? '★★' : null].filter(Boolean).join('');
		const name = marks ? `${marks} ${t.name}` : t.name;
		return `• **${name}** — ${t.text}`;
	}).join('\n');
}

async function renderCharacterSheetEmbed(characterRecord) {
	const conditions = await listConditions({ characterId: characterRecord.id });

	const traits = getTraits(characterRecord);

	// Parse special possessions from choices
	let specialPossessions = [];
	if (characterRecord.choices) {
		let parsed = characterRecord.choices;
		if (typeof parsed === 'string') {
			try { parsed = JSON.parse(parsed); }
			catch { parsed = {}; }
		}
		if (Array.isArray(parsed.chosen_possessions)) {
			specialPossessions = parsed.chosen_possessions;
		}
	}

	const embed = new EmbedBuilder()
		.setTitle(characterRecord.name)
		.addFields(
			{ name: 'HP', value: `\`${safeInline(characterRecord.hp)}/${safeInline(characterRecord.hp_max)}\``, inline: true },
			{ name: 'XP', value: `\`${String(characterRecord.xp ?? 0)}\``, inline: true },
			{ name: 'Debilities', value: `\`${Array.isArray(characterRecord.debilities) && characterRecord.debilities.length ? characterRecord.debilities.join(', ') : '—'}\``, inline: true },
		);

	embed.addFields(
		{ name: 'Traits', value: formatTraitBlock(traits).slice(0, 1024), inline: false },
	);

	const condText = conditions.length
		? conditions.map(c => c.name).slice(0, 10).join(', ')
		: '—';
	embed.addFields({ name: 'Conditions', value: `\`${condText}\``, inline: false });

	if (specialPossessions.length) {
		embed.addFields({ name: 'Special Possessions', value: `\`${specialPossessions.map(p => `• ${p}`).join('\n')}\``, inline: false });
	}

	// (Inventory removed from sheet embed; see note at top.)

	embed.setTimestamp(new Date());
	return embed;
}

module.exports = {
	renderCharacterSheetEmbed,
};
