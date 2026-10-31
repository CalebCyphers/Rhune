function replyEphemeral(interaction, contentOrPayload) {
	const body = typeof contentOrPayload === 'string'
		? { content: contentOrPayload }
		: { ...contentOrPayload };
	// Defer-aware: if the handler already deferred/replied, edit the response
	// instead of trying to reply again (which would throw). Discord ignores
	// `ephemeral` on edits, so drop it there.
	if (interaction.deferred || interaction.replied) {
		delete body.ephemeral;
		return interaction.editReply(body);
	}
	return interaction.reply({ ...body, ephemeral: true });
}

function updateClearComponents(interaction, payload) {
	const body = { ...payload, components: [] };
	// Works whether or not the caller deferred first.
	if (interaction.deferred || interaction.replied) {
		return interaction.editReply(body);
	}
	return interaction.update(body);
}

// --- Ack-within-3s helpers -------------------------------------------------
// Discord only gives us 3 seconds to acknowledge an interaction; a slow
// PocketBase round-trip blows that and the user sees "did not respond". These
// defer first (ack now), so the real work can take as long as it needs.
// Pair the reply-style ones with interaction.editReply(...).

/** For handlers that will edit the message the component is on. */
async function deferComponentUpdate(interaction) {
	if (interaction.deferred || interaction.replied) return;
	await interaction.deferUpdate();
}

/** For handlers that will reply with a NEW ephemeral message. */
async function deferEphemeralReply(interaction) {
	if (interaction.deferred || interaction.replied) return;
	await interaction.deferReply({ flags: 64 });
}

/** For slash commands (always ephemeral). */
async function deferCommand(interaction) {
	if (interaction.deferred || interaction.replied) return;
	await interaction.deferReply({ flags: 64 });
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
		// Prefer editing our deferred/ephemeral response so the user sees the
		// error in place; fall back to followUp/reply.
		if (interaction.deferred && !interaction.replied) {
			await interaction.editReply({ content: `Error: ${err.message}` });
		}
		else if (interaction.replied) {
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
	deferComponentUpdate,
	deferEphemeralReply,
	deferCommand,
};
