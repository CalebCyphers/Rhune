const { EmbedBuilder } = require('discord.js');

const { listConditions } = require('./conditions_pb');
const { listInventory } = require('./inventory_pb');

function safeInline(v) {
	const s = String(v ?? '').trim();
	return s.length ? s : '—';
}

function formatStatTable(stats) {
	const s = stats || {};
	// Simple markdown table. Discord doesn't perfectly align proportional fonts,
	// but this reads cleaner than a long single line.
	return [
		'| STR | DEX | CON |',
		'|---:|---:|---:|',
		`| ${safeInline(s.str ?? 0)} | ${safeInline(s.dex ?? 0)} | ${safeInline(s.con ?? 0)} |`,
		'',
		'| INT | WIS | CHA |',
		'|---:|---:|---:|',
		`| ${safeInline(s.int ?? 0)} | ${safeInline(s.wis ?? 0)} | ${safeInline(s.cha ?? 0)} |`,
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
			{ name: '♡ HP', value: `${safeInline(characterRecord.hp)}/${safeInline(characterRecord.hp_max)}`, inline: true },
			{ name: 'XP', value: String(characterRecord.xp ?? 0), inline: true },
		);

	// De-emphasize metadata: keep it, but move it to the footer.
	// Use a mention so it's still easy to see who owns the sheet.
	embed.setFooter({ text: `Owner: <@${characterRecord.owner_user_id}> • id: ${characterRecord.id}` });

	const condText = conditions.length
		? conditions.map(c => c.name).slice(0, 10).join(', ')
		: '—';
	embed.addFields(
		{ name: '⚠︎ Conditions', value: condText, inline: false },
		{ name: '✰ Stats', value: formatStatTable(characterRecord.stats), inline: false },
	);

	const loadCurrent = String(characterRecord.load_current ?? 0);
	const inventoryFieldName = `❒ Inventory — Load ${loadCurrent}`;

	if (inventory.length) {
		const preview = inventory.slice(0, 6).map(it => `• ${it.qty ?? 1}× ${it.name}${it.notes ? ` — ${it.notes}` : ''}`);
		const remaining = inventory.length - preview.length;
		if (remaining > 0) preview.push(`…and ${remaining} more (use /inv list)`);
		embed.addFields({ name: inventoryFieldName, value: preview.join('\n'), inline: false });
	}
	else {
		embed.addFields({ name: inventoryFieldName, value: '—', inline: false });
	}

	embed.setTimestamp(new Date());
	return embed;
}

module.exports = {
	renderCharacterSheetEmbed,
};
