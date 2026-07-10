const { SlashCommandBuilder, AttachmentBuilder } = require('discord.js');

const { roll2d6, rollExpr } = require('../lib/dice');
const { exprResultEmbed, twoD6Embed, withRollId } = require('../lib/format');
const { getLastRoll, logRoll } = require('../lib/rolllog_pb');
const { diceImagePath, diceImageName } = require('../lib/dice_images');

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
			))
		.addBooleanOption(option => option
			.setName('last')
			.setDescription('Show your most recent roll (ignores other options)')
			.setRequired(false)),
	async execute(interaction) {
		const showLast = interaction.options.getBoolean('last') || false;
		const expr = interaction.options.getString('expr') || '2d6';
		const mode = interaction.options.getString('mode') || 'normal';

		try {
			// Build a nice response wrapper so we can optionally attach dice images.
			function buildReply({ embed, rollResult, rollId }) {
				const files = [];

				// For now: only show an icon for single-die results of d6 or d20.
				// (Skip 2d6 PbtA rolls and multi-die expressions.)
				if (rollResult?.type === 'expr' && rollResult.count === 1 && (rollResult.sides === 6 || rollResult.sides === 20)) {
					const face = rollResult.rolls?.[0];
					const filePath = diceImagePath({ sides: rollResult.sides, face });
					const fileName = diceImageName({ sides: rollResult.sides, face });
					if (filePath && fileName) {
						files.push(new AttachmentBuilder(filePath, { name: fileName }));
						embed.setThumbnail(`attachment://${fileName}`);
					}
				}

				return { embeds: [withRollId(embed, rollId)], files };
			}

			if (showLast) {
				const last = await getLastRoll({ guildId: interaction.guildId, userId: interaction.user.id });
				if (!last) {
					await interaction.reply({ content: 'No previous rolls found for you in this server yet.', ephemeral: true });
					return;
				}

				let embed;
				if (last.result?.type === '2d6') {
					const modifier = last.result.modifier || 0;
					embed = twoD6Embed(last.result, modifier);
				}
				else {
					embed = exprResultEmbed(last.result);
				}

				await interaction.reply(buildReply({ embed, rollResult: last.result, rollId: last.id }));
				return;
			}

			// Special case: treat a bare 2d6 (with optional +/- modifier) as a PbtA-style roll.
			const cleaned = String(expr).trim().toLowerCase().replace(/\s+/g, '');
			const match2d6 = cleaned.match(/^2d6(?<mod>[+-]\d+)?$/);
			if (match2d6) {
				const modifier = match2d6.groups?.mod ? Number.parseInt(match2d6.groups.mod, 10) : 0;
				const result = roll2d6(mode);

				const rollId = await logRoll({
					guildId: interaction.guildId,
					channelId: interaction.channelId,
					userId: interaction.user.id,
					commandName: 'roll',
					expr: cleaned,
					mode,
					result: { ...result, modifier },
				});

				const embed = twoD6Embed(result, modifier);
				await interaction.reply(buildReply({ embed, rollResult: { ...result, modifier }, rollId }));
				return;
			}

			const modeOverride = mode === 'normal' ? null : mode;
			const result = rollExpr(expr, modeOverride);

			const rollId = await logRoll({
				guildId: interaction.guildId,
				channelId: interaction.channelId,
				userId: interaction.user.id,
				commandName: 'roll',
				expr,
				mode: result.mode,
				result,
			});

			const embed = exprResultEmbed(result);
			await interaction.reply(buildReply({ embed, rollResult: result, rollId }));
		}
		catch (err) {
			await interaction.reply({ content: `Could not roll: ${err.message}`, ephemeral: true });
		}
	},
};
