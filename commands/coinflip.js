const { SlashCommandBuilder } = require('discord.js');
const Chance = require('chance');

const chance = new Chance();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('Replies with Heads or Tails'),
    async execute(interaction) {
        const result = chance.coin();
        await interaction.reply(`${result}`);
    },
};