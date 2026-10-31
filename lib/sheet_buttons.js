// Character-sheet action buttons.
//
// Shared so the sheet renders identically wherever it's shown (the /char sheet
// command and the creation finalize step). Also carries the "Rules ↗" link
// button that points at the character's playbook on the public rules site (or
// the primer when there's no playbook).
//
// The old separate "Playbook" view/button is gone — damage/background/instinct/
// moves now render on the sheet itself, each linked to its full text.

const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { lookupPlaybook } = require('./playbooks');
const siteLinks = require('./site_links');

/**
 * Build the action row for a character sheet.
 *
 * @param {object} record  character record
 * @param {object} [opts]
 * @param {boolean} [opts.includeInventory=true]  show the Inventory button
 * @returns {ActionRowBuilder}
 */
function buildSheetButtons(record, { includeInventory = true } = {}) {
	const row = new ActionRowBuilder();
	const hasPlaybook = record.playbook && lookupPlaybook(record.playbook);

	row.addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:move:sheet:${record.id}`)
			.setLabel('Moves')
			.setStyle(ButtonStyle.Secondary),
	);

	if (includeInventory) {
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:inventory:${record.id}`)
				.setLabel('Inventory')
				.setStyle(ButtonStyle.Secondary),
		);
	}

	row.addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:edit:${record.id}`)
			.setLabel('Edit')
			.setStyle(ButtonStyle.Secondary),
	);

	// Rules-site link button (link buttons ignore customId and just open a URL).
	const rulesUrl = hasPlaybook ? siteLinks.playbookUrl(record.playbook) : siteLinks.HOW_TO_PLAY_URL;
	if (rulesUrl) {
		row.addComponents(
			new ButtonBuilder()
				.setLabel(hasPlaybook ? 'Rules ↗' : 'How to Play ↗')
				.setStyle(ButtonStyle.Link)
				.setURL(rulesUrl),
		);
	}

	return row;
}

module.exports = { buildSheetButtons };
