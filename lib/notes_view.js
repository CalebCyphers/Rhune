// Notes view + edit-modal builders (shared by the sheet button and /notes).
//
// Notes are freeform: the bot never parses them. Editing happens in a Discord
// modal (click → type → submit), which replaced the old "post a template, then
// reply to it" inventory flow.

const {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require('discord.js');

// Embed descriptions cap at 4096; leave room to spare.
const NOTES_DISPLAY_LIMIT = 3900;
// Modal paragraph text-input cap.
const NOTES_INPUT_LIMIT = 4000;
const NOTES_MODAL_INPUT_ID = 'notes_text';

/** Truncate notes for display, flagging that there's more. */
function clipForDisplay(text) {
	const str = String(text ?? '');
	if (str.length <= NOTES_DISPLAY_LIMIT) return str;
	return `${str.slice(0, NOTES_DISPLAY_LIMIT)}\n\n_…(truncated)_`;
}

/** Modal for editing a character's notes, pre-filled with the current text. */
function buildNotesModal(charId, currentText) {
	const modal = new ModalBuilder()
		.setCustomId(`rhune:notes:edit:${charId}`)
		.setTitle('Character Notes');

	const input = new TextInputBuilder()
		.setCustomId(NOTES_MODAL_INPUT_ID)
		.setLabel('Notes')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setMaxLength(NOTES_INPUT_LIMIT);

	const existing = String(currentText ?? '');
	if (existing.length) input.setValue(existing.slice(0, NOTES_INPUT_LIMIT));

	modal.addComponents(new ActionRowBuilder().addComponents(input));
	return modal;
}

/** Display view: the notes plus an "Edit notes" button. */
function buildNotesView(record, text) {
	const embed = new EmbedBuilder().setTitle(`📝 ${record.name} — Notes`);

	if (text) {
		embed.setDescription(clipForDisplay(text));
	}
	else {
		embed.setDescription('_No notes yet. Hit **Edit notes** to add some._');
	}

	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:notesedit:${record.id}`)
			.setLabel('Edit notes')
			.setStyle(ButtonStyle.Primary),
	);

	return { embeds: [embed], components: [row] };
}

module.exports = {
	buildNotesModal,
	buildNotesView,
	clipForDisplay,
	NOTES_DISPLAY_LIMIT,
	NOTES_INPUT_LIMIT,
	NOTES_MODAL_INPUT_ID,
};
