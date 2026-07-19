const { EmbedBuilder } = require('discord.js');

const { listConditions } = require('./conditions_pb');
const { listInventory } = require('./inventory_pb');

function safeInline(v) {
	const s = String(v ?? '').trim();
	return s.length ? s : '—';
}

function formatStat(v) {
	const n = Number(v ?? 0);
	return (n > 0 ? '+' : '') + n;
}

function formatStatBlock(stats) {
	const s = stats || {};
	// Monospace keeps columns aligned in Discord embeds.
	const line1 = `STR ${formatStat(s.str).padStart(3, ' ')}   DEX ${formatStat(s.dex).padStart(3, ' ')}   CON ${formatStat(s.con).padStart(3, ' ')}`;
	const line2 = `INT ${formatStat(s.int).padStart(3, ' ')}   WIS ${formatStat(s.wis).padStart(3, ' ')}   CHA ${formatStat(s.cha).padStart(3, ' ')}`;
	return `\`\`\`\n${line1}\n${line2}\n\`\`\``;
}

async function renderCharacterSheetEmbed(characterRecord) {
	const conditions = await listConditions({ characterId: characterRecord.id });
	const inventory = await listInventory({ characterId: characterRecord.id });

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

	const condText = conditions.length
		? conditions.map(c => c.name).slice(0, 10).join(', ')
		: '—';
	embed.addFields(
		{ name: 'Stats', value: formatStatBlock(characterRecord.stats), inline: false },
		{ name: 'Conditions', value: `\`${condText}\``, inline: false },
	);

	const loadCurrent = String(characterRecord.load_current ?? 0);
	const inventoryFieldName = `Inventory (current load ${loadCurrent})`;

	if (specialPossessions.length) {
		embed.addFields({ name: 'Special Possessions', value: `\`${specialPossessions.map(p => `• ${p}`).join('\n')}\``, inline: false });
	}

	if (inventory.length) {
		const preview = inventory.slice(0, 6).map(it => `• ${it.qty ?? 1}× ${it.name}${it.notes ? ` — ${it.notes}` : ''}`);
		const remaining = inventory.length - preview.length;
		if (remaining > 0) preview.push(`…and ${remaining} more (use /inv list)`);
		embed.addFields({ name: inventoryFieldName, value: `\`${preview.join('\n')}\``, inline: false });
	}
	else {
		embed.addFields({ name: inventoryFieldName, value: '`—`', inline: false });
	}

	embed.setTimestamp(new Date());
	return embed;
}

module.exports = {
	renderCharacterSheetEmbed,
};
