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

async function handleError(interaction, err) {
	console.error(err);
	try {
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: `Error: ${err.message}`, ephemeral: true });
		}
		else {
			await replyEphemeral(interaction, `Error: ${err.message}`);
		}
	}
	catch {
		// If even the error reply fails, just log it
	}
}

module.exports = {
	replyEphemeral,
	updateClearComponents,
	requireGuild,
	handleError,
};
