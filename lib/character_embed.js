const { EmbedBuilder } = require('discord.js');

const { listConditions } = require('./conditions_pb');
const { listInventory } = require('./inventory_pb');

function safeInline(v) {
	const s = String(v ?? '').trim();
	return s.length ? s : '—';
}

function formatStatBlock(stats) {
	const s = stats || {};
	// Two-column layout for readability on mobile.
	return [
		`**STR** ${safeInline(s.str ?? 0)}    **DEX** ${safeInline(s.dex ?? 0)}    **CON** ${safeInline(s.con ?? 0)}`,
		`**INT** ${safeInline(s.int ?? 0)}    **WIS** ${safeInline(s.wis ?? 0)}    **CHA** ${safeInline(s.cha ?? 0)}`,
	].join('\n');
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
			{ name: 'Stats', value: formatStatBlock(characterRecord.stats), inline: false },
			{ name: 'HP', value: `${safeInline(characterRecord.hp)}/${safeInline(characterRecord.hp_max)}`, inline: true },
			{ name: 'XP', value: String(characterRecord.xp ?? 0), inline: true },
		);

	// De-emphasize metadata: keep it, but move it to the footer.
	embed.setFooter({ text: `Owner: @${characterRecord.owner_user_id} • id: ${characterRecord.id}` });

	const condText = conditions.length
		? conditions.map(c => c.name).slice(0, 10).join(', ')
		: '—';
	embed.addFields({ name: 'Conditions', value: condText, inline: false });

	const loadLine = `**Load**: ${String(characterRecord.load_current ?? 0)}/${String(characterRecord.load_max ?? 0)}`;

	if (inventory.length) {
		const preview = inventory.slice(0, 6).map(it => `• ${it.qty ?? 1}× ${it.name}${it.notes ? ` — ${it.notes}` : ''}`);
		// Keep Load with Inventory, since they conceptually pair.
		preview.unshift(loadLine);
		const remaining = inventory.length - 6;
		if (remaining > 0) preview.push(`…and ${remaining} more (use /inv list)`);
		embed.addFields({ name: 'Inventory', value: preview.join('\n'), inline: false });
	}
	else {
		embed.addFields({ name: 'Inventory', value: `${loadLine}\n—`, inline: false });
	}

	embed.setTimestamp(new Date());
	return embed;
}

module.exports = {
	renderCharacterSheetEmbed,
};
