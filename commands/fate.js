const { SlashCommandBuilder } = require('discord.js');

const { rollFate } = require('../lib/dice');
const { fateEmbed, withRollId } = require('../lib/format');
const { logRoll } = require('../lib/rolllog');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('fate')
		.setDescription('Roll a Die of Fate (d6): low is bad, high is good'),
	async execute(interaction) {
		const result = rollFate();
		const rollId = logRoll({
			guildId: interaction.guildId,
			channelId: interaction.channelId,
			userId: interaction.user.id,
			commandName: 'fate',
			expr: 'd6',
			mode: 'normal',
			result,
		});
		const embed = withRollId(fateEmbed(result), rollId);
		await interaction.reply({ embeds: [embed] });
	},
};
