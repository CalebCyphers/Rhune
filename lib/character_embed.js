const { EmbedBuilder } = require('discord.js');

const { listConditions } = require('./conditions_pb');
const { listInventory } = require('./inventory_pb');

function safeInline(v) {
	const s = String(v ?? '').trim();
	return s.length ? s : '—';
}

function formatStatBlock(stats) {
	const s = stats || {};
	// Monospace keeps columns aligned in Discord embeds.
	const line1 = `STR ${safeInline(s.str ?? 0).padStart(2, ' ')}   DEX ${safeInline(s.dex ?? 0).padStart(2, ' ')}   CON ${safeInline(s.con ?? 0).padStart(2, ' ')}`;
	const line2 = `INT ${safeInline(s.int ?? 0).padStart(2, ' ')}   WIS ${safeInline(s.wis ?? 0).padStart(2, ' ')}   CHA ${safeInline(s.cha ?? 0).padStart(2, ' ')}`;
	return `\`\`\`\n${line1}\n${line2}\n\`\`\``;
}

async function renderCharacterSheetEmbed(characterRecord) {
	const conditions = await listConditions({ characterId: characterRecord.id });
	const inventory = await listInventory({ characterId: characterRecord.id });

	const nameLine = characterRecord.playbook
		? `${characterRecord.name} — ${characterRecord.playbook}`
		: characterRecord.name;

	const embed = new EmbedBuilder()
		.setTitle(nameLine)
		.addFields(
			{ name: 'HP', value: `\`${safeInline(characterRecord.hp)}/${safeInline(characterRecord.hp_max)}\``, inline: true },
			{ name: 'XP', value: `\`${String(characterRecord.xp ?? 0)}\``, inline: true },
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

	if (inventory.length) {
		const preview = inventory.slice(0, 6).map(it => `• ${it.qty ?? 1}× ${it.name}${it.notes ? ` — ${it.notes}` : ''}`);
		const remaining = inventory.length - preview.length;
		if (remaining > 0) preview.push(`…and ${remaining} more (use /inv list)`);
		embed.addFields({ name: inventoryFieldName, value: `\`${preview.join('\n')}\``, inline: false });
	}
	else {
		embed.addFields({ name: inventoryFieldName, value: "\`—\`", inline: false });
	}

	embed.setTimestamp(new Date());
	return embed;
}

module.exports = {
	renderCharacterSheetEmbed,
};
