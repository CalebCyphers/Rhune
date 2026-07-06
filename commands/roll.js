const { SlashCommandBuilder } = require('discord.js');

const { roll2d6, rollExpr } = require('../lib/dice');
const { exprResultEmbed, twoD6Embed, withRollId } = require('../lib/format');
const { logRoll } = require('../lib/rolllog');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('roll')
		.setDescription('Roll dice (supports basic expressions like d20, 2d6+1, or 2d6 with adv/dis)')
		.addStringOption(option => option
			.setName('expr')
			.setDescription('Dice expression (e.g. d20, 2d6+1). If omitted, defaults to 2d6.')
			.setRequired(false))
		.addStringOption(option => option
			.setName('mode')
			.setDescription('Advantage/disadvantage: roll one extra die and drop lowest/highest (single die type only)')
			.setRequired(false)
			.addChoices(
				{ name: 'normal', value: 'normal' },
				{ name: 'adv', value: 'adv' },
				{ name: 'dis', value: 'dis' },
			)),
	async execute(interaction) {
		const expr = interaction.options.getString('expr') || '2d6';
		const mode = interaction.options.getString('mode') || 'normal';

		try {
			// Special case: treat a bare 2d6 (with optional +/- modifier) as a PbtA-style roll.
			const cleaned = String(expr).trim().toLowerCase().replace(/\s+/g, '');
			const match2d6 = cleaned.match(/^2d6(?<mod>[+-]\d+)?$/);
			if (match2d6) {
				const modifier = match2d6.groups?.mod ? Number.parseInt(match2d6.groups.mod, 10) : 0;
				const result = roll2d6(mode);

				const rollId = logRoll({
					guildId: interaction.guildId,
					channelId: interaction.channelId,
					userId: interaction.user.id,
					commandName: 'roll',
					expr: cleaned,
					mode,
					result: { ...result, modifier },
				});

				const embed = withRollId(twoD6Embed(result, modifier), rollId);
				await interaction.reply({ embeds: [embed] });
				return;
			}

			const modeOverride = mode === 'normal' ? null : mode;
			const result = rollExpr(expr, modeOverride);

			const rollId = logRoll({
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				userId: interaction.user.id,
				commandName: 'roll',
				expr,
				mode: result.mode,
				result,
			});

			const embed = withRollId(exprResultEmbed(result), rollId);
			await interaction.reply({ embeds: [embed] });
		}
		catch (err) {
			await interaction.reply({ content: `Could not roll: ${err.message}`, ephemeral: true });
		}
	},
};
