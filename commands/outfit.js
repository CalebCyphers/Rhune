const { SlashCommandBuilder } = require('discord.js');

const { getCharacterById, getActiveCharacterId } = require('../lib/characters_pb');
const { setPending } = require('../lib/pending_actions');
const { getInventoryState } = require('../lib/inventory_state_pb');
const { replyEphemeral, requireGuild } = require('../lib/interaction_helpers');
const { buildOutfitTemplate } = require('../lib/inventory_template');

// Discord hard limit.
const DISCORD_MESSAGE_LIMIT = 2000;

async function resolveCharRecord(interaction) {
	const target = interaction.options.getString('target');
	if (target) {
		// For now, treat target as an id (consistent with /inv's existing pattern).
		// We can expand to name/disambiguation later if desired.
		const record = await getCharacterById({ id: target, guildId: interaction.guildId });
		return record || null;
	}
	const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
	if (!activeId) return null;
	return getCharacterById({ id: activeId, guildId: interaction.guildId });
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('outfit')
		.setDescription('Get an inventory template and save your inventory note by replying')
		.addStringOption(opt => opt
			.setName('target')
			.setDescription('Character record id (defaults to your active character)')
			.setRequired(false))
		.addBooleanOption(opt => opt
			.setName('use_current')
			.setDescription('Use your currently saved inventory note as the starting template')
			.setRequired(false)),

	async execute(interaction) {
		try {
			requireGuild(interaction);

			const record = await resolveCharRecord(interaction);
			if (!record) {
				await replyEphemeral(interaction, 'No active character set. Use `/char active target:<name|id>` or pass a character id to `/outfit`.');
				return;
			}
			if (record.owner_user_id !== interaction.user.id) {
				await replyEphemeral(interaction, 'You do not own that character.');
				return;
			}

			const useCurrent = interaction.options.getBoolean('use_current') || false;
			let template = buildOutfitTemplate({ characterName: record.name });
			if (useCurrent) {
				const current = await getInventoryState({ characterId: record.id, guildId: interaction.guildId });
				if (current?.inventory_text) template = String(current.inventory_text);
			}

			// Post a normal message to the channel so the user can reply.
			const header = `**Outfit: ${record.name}**\nReply to *this message* with your edited inventory note to save.\n\n` +
				`Limits: keep your reply under **${DISCORD_MESSAGE_LIMIT} characters**.\n` +
				'Tip: you can delete sections you don\'t need.';
			const body = '```\n' + template.slice(0, DISCORD_MESSAGE_LIMIT - 10) + '\n```';
			const templateMsg = await interaction.channel.send({ content: header + '\n' + body });

			// Store a pending action keyed by user. We only accept replies to this exact message.
			setPending(interaction.user.id, {
				action: 'outfit_save',
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				templateMessageId: templateMsg.id,
				characterId: record.id,
				expiresAt: Date.now() + 15 * 60 * 1000,
			});

			await interaction.reply({
				content: 'I posted your outfit template above. Reply to that message with your updated inventory note to save.\n\nAfter saving:\n• Check: `/inv check`\n• Edit again: `/outfit`',
				ephemeral: true,
			});
		}
		catch (err) {
			const status = err?.status ? ` (status ${err.status})` : '';
			const detail = err?.data ? `\n${JSON.stringify(err.data)}` : '';
			const url = err?.url ? `\nurl: ${err.url}` : '';
			await replyEphemeral(interaction, `Error${status}: ${err.message}${detail}${url}`);
		}
	},

	// Expose constant for message handler tests/usage.
	DISCORD_MESSAGE_LIMIT,
};
