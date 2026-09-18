// Guild-owner ("GM") authorization helper.
//
// Design (Kaia, 2026-09-18): the guild owner is treated as the GM. No DB
// storage needed (Option A). This lets a GM check & edit any character's sheet
// in a guild, while players remain restricted to their own.

/**
 * True if `userId` is the owner of the guild the interaction happened in.
 * Uses interaction.guild.ownerId (available without an extra fetch) with a
 * safe fallback to fetching the full guild.
 *
 * @param {import('discord.js').BaseInteraction} interaction
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isGuildOwner(interaction, userId) {
	if (!interaction?.guildId || !userId) return false;

	try {
		let ownerId = interaction.guild?.ownerId;

		// interaction.guild is often not a full cached guild (esp. in this bot's
		// Docker/partial environment). If ownerId is unknown, fetch the guild by id
		// from the client channels/caches. This avoids the false-false (`Missing
		// Access` / incorrectly blocks the actual owner) we saw with /char list all.
		if (!ownerId) {
			if (interaction.guild?.fetch) {
				const full = await interaction.guild.fetch();
				ownerId = full?.ownerId;
			}
			else if (interaction.client?.guilds) {
				const guild = await interaction.client.guilds.fetch(interaction.guildId);
				ownerId = guild?.ownerId;
			}
		}
		return ownerId === userId;
	}
	catch {
		return false;
	}
}

module.exports = { isGuildOwner };
