const { SlashCommandBuilder } = require('discord.js');

const { getCharacterById, getActiveCharacterId } = require('../lib/characters_pb');
const { getNotesText, upsertNotes } = require('../lib/notes_state_pb');
const { buildNotesView, NOTES_INPUT_LIMIT } = require('../lib/notes_view');
const { replyEphemeral, requireGuild, deferCommand } = require('../lib/interaction_helpers');

// NOTE: a slash command may NOT mix top-level options with subcommands —
// Discord rejects that with "Invalid Form Body". So /notes is flat:
//   /notes                 -> view notes (with an Edit-notes button)
//   /notes text:<...>      -> set notes
//   /notes target:<id>     -> pick a non-active character
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
			.setName('text')
			.setDescription('New notes text (omit to just view your notes)')
			.setRequired(false))
		.addStringOption(opt => opt
			.setName('target')
			.setDescription('Character record id (defaults to your active character)')
			.setRequired(false)),

	async execute(interaction) {
		try {
			requireGuild(interaction);

			// Ack within Discord's 3s window before any PocketBase work.
			await deferCommand(interaction);

			const record = await resolveCharRecord(interaction);
			if (!record) {
				await replyEphemeral(interaction, 'No active character set. Use `/char active target:<name|id>` or pass a character id to `/notes`.');
				return;
			}
			if (record.owner_user_id !== interaction.user.id) {
				await replyEphemeral(interaction, 'You do not own that character.');
				return;
			}

			const provided = interaction.options.getString('text');
			if (provided !== null) {
				const text = String(provided).trim();
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
				await interaction.editReply({ embeds, components });
				return;
			}

			// No text given: view (the view carries the Edit-notes modal button).
			const text = await getNotesText({ characterId: record.id, guildId: interaction.guildId });
			const { embeds, components } = buildNotesView(record, text);
			await interaction.editReply({ embeds, components });
		}
		catch (err) {
			const status = err?.status ? ` (status ${err.status})` : '';
			const detail = err?.data ? `\n${JSON.stringify(err.data)}` : '';
			const url = err?.url ? `\nurl: ${err.url}` : '';
			await replyEphemeral(interaction, `Error${status}: ${err.message}${detail}${url}`);
		}
	},
};
