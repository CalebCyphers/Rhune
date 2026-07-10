const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PREFIX = 'rhune:pickchar:';

function buildPickCharCustomId({ action, charId }) {
	// Keep it short to stay under Discord customId limits.
	// Encode: rhune:pickchar:<action>:<charId>
	return `${PREFIX}${action}:${charId}`;
}

function parsePickCharCustomId(customId) {
	if (!customId || !customId.startsWith(PREFIX)) return null;
	const rest = customId.slice(PREFIX.length);
	const [action, charId] = rest.split(':');
	if (!action || !charId) return null;
	return { action, charId };
}

function disambiguationMessage({ target, matches, action }) {
	const rows = [];
	const chunks = [];
	for (let i = 0; i < matches.length && i < 20; i++) {
		chunks.push(matches[i]);
	}

	for (let i = 0; i < chunks.length; i += 5) {
		const slice = chunks.slice(i, i + 5);
		const row = new ActionRowBuilder();
		for (const c of slice) {
			const label = `${c.name}${c.playbook ? ` (${c.playbook})` : ''}`.slice(0, 80);
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(buildPickCharCustomId({ action, target, charId: c.id }))
					.setLabel(label)
					.setStyle(ButtonStyle.Secondary),
			);
		}
		rows.push(row);
	}

	const content = `Multiple characters match **${target}**. Pick one:`;
	return { content, components: rows, ephemeral: true };
}

module.exports = {
	buildPickCharCustomId,
	parsePickCharCustomId,
	disambiguationMessage,
};
