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
		if (!ownerId && interaction.guild?.fetch) {
			const full = await interaction.guild.fetch();
			ownerId = full?.ownerId;
		}
		return ownerId === userId;
	}
	catch {
		return false;
	}
}

module.exports = { isGuildOwner };
