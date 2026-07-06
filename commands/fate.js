const { SlashCommandBuilder } = require('discord.js');

const { rollFate } = require('../lib/dice');
const { fateEmbed } = require('../lib/format');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('fate')
		.setDescription('Roll a Die of Fate (d6): low is bad, high is good'),
	async execute(interaction) {
		const result = rollFate();
		const embed = fateEmbed(result);
		await interaction.reply({ embeds: [embed] });
	},
};
