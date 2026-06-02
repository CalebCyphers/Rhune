const { InteractionContextType, SlashCommandBuilder } = require('discord.js');
const Chance = require('chance');

const chance = new Chance();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Input format: #d#, returns an array of dice values.')
        .addStringOption((option) => option.setName('input').setDescription('An input looking like #d#'))
        .setContexts(InteractionContextType.Guild),
    async execute(interaction) {
        const input = interaction.options.getString('input')
        // TO-DO add error handling
        const result = chance.rpg(input)
        await interaction.reply(`Rolled ${input} and got: ${result}`);
    },
};