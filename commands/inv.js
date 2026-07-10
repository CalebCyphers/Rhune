const { SlashCommandBuilder } = require('discord.js');

const { getCharacterById, getActiveCharacterId } = require('../lib/characters_pb');
const { listInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem } = require('../lib/inventory_pb');

async function resolveCharRecord(interaction) {
	const idOpt = interaction.options.getString('id');
	if (idOpt) return getCharacterById({ id: idOpt });
	const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
	if (!activeId) return null;
	return getCharacterById({ id: activeId });
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('inv')
		.setDescription('Inventory management')
		.addSubcommand(sub => sub
			.setName('list')
			.setDescription('List inventory for your active character (or by id)')
			.addStringOption(opt => opt.setName('id').setDescription('Character record id (defaults to active)').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('add')
			.setDescription('Add an inventory item')
			.addStringOption(opt => opt.setName('id').setDescription('Character record id (defaults to active)').setRequired(false))
			.addStringOption(opt => opt.setName('name').setDescription('Item name').setRequired(true))
			.addIntegerOption(opt => opt.setName('qty').setDescription('Quantity (default 1)').setRequired(false))
			.addStringOption(opt => opt.setName('notes').setDescription('Notes (optional)').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('set')
			.setDescription('Set an inventory item quantity/notes by item record id')
			.addStringOption(opt => opt.setName('item_id').setDescription('Inventory item record id').setRequired(true))
			.addIntegerOption(opt => opt.setName('qty').setDescription('Quantity').setRequired(false))
			.addStringOption(opt => opt.setName('notes').setDescription('Notes').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('remove')
			.setDescription('Remove an inventory item by item record id')
			.addStringOption(opt => opt.setName('item_id').setDescription('Inventory item record id').setRequired(true))),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();

		try {
			if (!interaction.guildId) {
				await interaction.reply({ content: 'This command only works inside a server.', ephemeral: true });
				return;
			}

			if (sub === 'list') {
				const record = await resolveCharRecord(interaction);
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active id:<id>` or pass an id to `/inv list`.', ephemeral: true });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				const items = await listInventory({ characterId: record.id });
				if (!items.length) {
					await interaction.reply({ content: `No inventory items for **${record.name}** yet.`, ephemeral: true });
					return;
				}
				const lines = items.map(it => `• ${it.qty ?? 1}× **${it.name}**${it.notes ? ` — ${it.notes}` : ''} (id: \`${it.id}\`)`);
				await interaction.reply({ content: lines.join('\n'), ephemeral: true });
				return;
			}

			if (sub === 'add') {
				const record = await resolveCharRecord(interaction);
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active id:<id>` or pass an id to `/inv add`.', ephemeral: true });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				const name = interaction.options.getString('name');
				const qty = interaction.options.getInteger('qty') ?? 1;
				const notes = interaction.options.getString('notes');

				const item = await addInventoryItem({ characterId: record.id, name, qty, notes });
				await interaction.reply({ content: `Added **${item.name}** (qty ${item.qty ?? qty}) to **${record.name}**. (item id: \`${item.id}\`)`, ephemeral: true });
				return;
			}

			if (sub === 'set') {
				const itemId = interaction.options.getString('item_id');
				const qty = interaction.options.getInteger('qty');
				const notes = interaction.options.getString('notes');

				const patch = {};
				if (qty !== null) patch.qty = qty;
				if (notes !== null) patch.notes = notes;
				if (!Object.keys(patch).length) {
					await interaction.reply({ content: 'Nothing to set. Provide qty and/or notes.', ephemeral: true });
					return;
				}

				// NOTE: We don't currently verify ownership here because we don't have the character_id without fetching the item.
				// For v1, keep collections admin-only and rely on bot usage; we can harden by fetching + checking owner later.
				await updateInventoryItem({ id: itemId, patch });
				await interaction.reply({ content: `Updated inventory item \`${itemId}\`.`, ephemeral: true });
				return;
			}

			if (sub === 'remove') {
				const itemId = interaction.options.getString('item_id');
				await deleteInventoryItem({ id: itemId });
				await interaction.reply({ content: `Removed inventory item \`${itemId}\`.`, ephemeral: true });
				return;
			}

			await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
		}
		catch (err) {
			const status = err?.status ? ` (status ${err.status})` : '';
			const detail = err?.data ? `\n${JSON.stringify(err.data)}` : '';
			const url = err?.url ? `\nurl: ${err.url}` : '';
			await interaction.reply({ content: `Error${status}: ${err.message}${detail}${url}`, ephemeral: true });
		}
	},
};
