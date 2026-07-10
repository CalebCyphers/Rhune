function replyEphemeral(interaction, contentOrPayload) {
	if (typeof contentOrPayload === 'string') {
		return interaction.reply({ content: contentOrPayload, ephemeral: true });
	}
	return interaction.reply({ ...contentOrPayload, ephemeral: true });
}

function updateClearComponents(interaction, payload) {
	return interaction.update({ ...payload, components: [] });
}

function requireGuild(interaction) {
	if (!interaction.guildId) {
		const err = new Error('This command only works inside a server.');
		err.code = 'RHUNE_NO_GUILD';
		throw err;
	}
}

module.exports = {
	replyEphemeral,
	updateClearComponents,
	requireGuild,
};
