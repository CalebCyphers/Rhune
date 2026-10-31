const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildMoveReferenceRoot } = require('../lib/move_views');

const data = new SlashCommandBuilder()
	.setName('moves')
	.setDescription('Look up moves by category')
	.addSubcommand(sub =>
		sub.setName('list')
			.setDescription('Show all move categories'),
	);

async function execute(interaction) {
	const sub = interaction.options.getSubcommand();

	if (sub === 'list') {
		const view = buildMoveReferenceRoot();
		await interaction.reply({ embeds: view.embeds, components: view.components, ephemeral: true });
	}
}

module.exports = { data, execute };
