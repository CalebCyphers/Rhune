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

// Discord.js sometimes does not populate interaction.channel (especially with
// partials / certain interaction lifecycles). Resolve it, fetching by id if null.
async function resolveTextChannel(interaction) {
	if (interaction.channel) return interaction.channel;
	if (!interaction.channelId || !interaction.client?.channels) return null;
	return interaction.client.channels.fetch(interaction.channelId, { cache: true, force: true });
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
	resolveTextChannel,
	handleError,
};
