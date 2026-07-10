const { SlashCommandBuilder } = require('discord.js');

const { getCharacterById, getActiveCharacterId } = require('../lib/characters_pb');
const { listInventory, addInventoryItem, getInventoryItemById, updateInventoryItem, deleteInventoryItem } = require('../lib/inventory_pb');
const { replyEphemeral, requireGuild } = require('../lib/interaction_helpers');

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
			.addStringOption(opt => opt.setName('name').setDescription('Item name').setRequired(true))
			.addStringOption(opt => opt.setName('id').setDescription('Character record id (defaults to active)').setRequired(false))
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
			requireGuild(interaction);

			if (sub === 'list') {
				const record = await resolveCharRecord(interaction);
				if (!record) {
					await replyEphemeral(interaction, 'No active character set. Use `/char active id:<id>` or pass an id to `/inv list`.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}

				const items = await listInventory({ characterId: record.id });
				if (!items.length) {
					await replyEphemeral(interaction, `No inventory items for **${record.name}** yet.`);
					return;
				}
				const lines = items.map(it => `• ${it.qty ?? 1}× **${it.name}**${it.notes ? ` — ${it.notes}` : ''} (id: \`${it.id}\`)`);
				await replyEphemeral(interaction, lines.join('\n'));
				return;
			}

			if (sub === 'add') {
				const record = await resolveCharRecord(interaction);
				if (!record) {
					await replyEphemeral(interaction, 'No active character set. Use `/char active id:<id>` or pass an id to `/inv add`.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}

				const name = interaction.options.getString('name');
				const qty = interaction.options.getInteger('qty') ?? 1;
				const notes = interaction.options.getString('notes');

				const item = await addInventoryItem({ characterId: record.id, name, qty, notes });
				await replyEphemeral(interaction, `Added **${item.name}** (qty ${item.qty ?? qty}) to **${record.name}**. (item id: \`${item.id}\`)`);
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
					await replyEphemeral(interaction, 'Nothing to set. Provide qty and/or notes.');
					return;
				}

				const item = await getInventoryItemById({ id: itemId });
				const character = await getCharacterById({ id: item.character_id });
				if (character.guild_id !== interaction.guildId) {
					await replyEphemeral(interaction, 'That item belongs to a character from a different server.');
					return;
				}
				if (character.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own the character that item belongs to.');
					return;
				}

				await updateInventoryItem({ id: itemId, patch });
				await replyEphemeral(interaction, `Updated inventory item \`${itemId}\`.`);
				return;
			}

			if (sub === 'remove') {
				const itemId = interaction.options.getString('item_id');
				const item = await getInventoryItemById({ id: itemId });
				const character = await getCharacterById({ id: item.character_id });
				if (character.guild_id !== interaction.guildId) {
					await replyEphemeral(interaction, 'That item belongs to a character from a different server.');
					return;
				}
				if (character.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own the character that item belongs to.');
					return;
				}

				await deleteInventoryItem({ id: itemId });
				await replyEphemeral(interaction, `Removed inventory item \`${itemId}\`.`);
				return;
			}

			await replyEphemeral(interaction, 'Unknown subcommand.');
		}
		catch (err) {
			const status = err?.status ? ` (status ${err.status})` : '';
			const detail = err?.data ? `\n${JSON.stringify(err.data)}` : '';
			const url = err?.url ? `\nurl: ${err.url}` : '';
			await replyEphemeral(interaction, `Error${status}: ${err.message}${detail}${url}`);
		}
	},
};
