const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { moves, categoryNames, getCategoryLabel } = require('../lib/moves_data');

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
		const embed = new EmbedBuilder()
			.setTitle('📖 Move Reference')
			.setDescription('Choose a category below to view its moves, then select a specific move to read its details.');

		const rows = categoryNames.map(cat => {
			const catMoves = moves[cat];
			const count = Object.keys(catMoves).length;
			return {
				name: getCategoryLabel(cat),
				value: `${count} move${count === 1 ? '' : 's'}`,
				inline: true,
			};
		});

		// Slice into groups of 3 for Discord's 3-per-row limit
		for (let i = 0; i < rows.length; i += 3) {
			embed.addFields(rows.slice(i, i + 3));
		}

		const backToCategories = new ActionRowBuilder()
			.addComponents(
				...categoryNames.map(cat =>
					new ButtonBuilder()
						.setCustomId(`rhune:move:cat:${cat}`)
						.setLabel(getCategoryLabel(cat))
						.setStyle(ButtonStyle.Secondary),
				),
			);

		await interaction.reply({ embeds: [embed], components: [backToCategories], ephemeral: true });
	}
}

module.exports = { data, execute };
