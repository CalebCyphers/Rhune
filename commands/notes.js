const { SlashCommandBuilder } = require('discord.js');

const { getCharacterById, getActiveCharacterId } = require('../lib/characters_pb');
const { getNotesText, upsertNotes } = require('../lib/notes_state_pb');
const { buildNotesView, NOTES_INPUT_LIMIT } = require('../lib/notes_view');
const { replyEphemeral, requireGuild } = require('../lib/interaction_helpers');

async function resolveCharRecord(interaction) {
	const target = interaction.options.getString('target');
	if (target) {
		return getCharacterById({ id: target, guildId: interaction.guildId });
	}
	const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
	if (!activeId) return null;
	return getCharacterById({ id: activeId, guildId: interaction.guildId });
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('notes')
		.setDescription('View or edit your character\'s freeform notes')
		.addStringOption(opt => opt
			.setName('target')
			.setDescription('Character record id (defaults to your active character)')
			.setRequired(false))
		.addSubcommand(sub => sub
			.setName('view')
			.setDescription('Show your character\'s notes'))
		.addSubcommand(sub => sub
			.setName('set')
			.setDescription('Set your character\'s notes (plain text)')
			.addStringOption(opt => opt
				.setName('text')
				.setDescription('Your notes text')
				.setRequired(true))),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();

		try {
			requireGuild(interaction);

			const record = await resolveCharRecord(interaction);
			if (!record) {
				await replyEphemeral(interaction, 'No active character set. Use `/char active target:<name|id>` or pass a character id to `/notes`.');
				return;
			}
			if (record.owner_user_id !== interaction.user.id) {
				await replyEphemeral(interaction, 'You do not own that character.');
				return;
			}

			if (sub === 'set') {
				const text = String(interaction.options.getString('text') ?? '').trim();
				if (text.length > NOTES_INPUT_LIMIT) {
					await replyEphemeral(interaction, `That's too long (${text.length} characters). Please keep notes under ${NOTES_INPUT_LIMIT} characters.`);
					return;
				}

				await upsertNotes({
					characterId: record.id,
					guildId: interaction.guildId,
					text,
					updatedByUserId: interaction.user.id,
				});

				const { embeds, components } = buildNotesView(record, text);
				await interaction.reply({ embeds, components, ephemeral: true });
				return;
			}

			// Default: view (also shows the modal-based editor for convenience).
			const text = await getNotesText({ characterId: record.id, guildId: interaction.guildId });
			const { embeds, components } = buildNotesView(record, text);
			await interaction.reply({ embeds, components, ephemeral: true });
		}
		catch (err) {
			const status = err?.status ? ` (status ${err.status})` : '';
			const detail = err?.data ? `\n${JSON.stringify(err.data)}` : '';
			const url = err?.url ? `\nurl: ${err.url}` : '';
			await replyEphemeral(interaction, `Error${status}: ${err.message}${detail}${url}`);
		}
	},
};
