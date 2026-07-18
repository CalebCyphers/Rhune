const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { roll2d6, rollExpr } = require('../lib/dice');
const { exprResultEmbed, twoD6Embed, withRollId } = require('../lib/format');
const { getLastRoll, logRoll } = require('../lib/rolllog_pb');
const { getActiveCharacterId } = require('../lib/characters_pb');
const { getCharacterById } = require('../lib/characters_pb');
const { diceImagePath, diceImageName } = require('../lib/dice_images');
const { renderPbtaD6Strip } = require('../lib/pbta_roll_strip');

/** Stat labels for display */
const STAT_LABELS = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };

// ─── Step 1: Modifier picker ─────────────────────────────────

/**
 * Show buttons for choosing flat 2d6 or a stat modifier.
 * If the user has an active character, buttons display their actual stat values.
 */
async function buildModifierPicker(userId, guildId) {
	let activeChar = null;
	try {
		const charId = await getActiveCharacterId({ guildId, userId });
		if (charId) {
			activeChar = await getCharacterById({ id: charId });
		}
	}
	catch {
		// No active character — proceed without stats
	}

	const embed = new EmbedBuilder()
		.setColor(0x6b3fa0)
		.setTitle('🎲 Quick Roll — Step 1')
		.setDescription('Pick what to add to your roll, then choose Normal / Advantage / Disadvantage.');

	const rows = [];

	// Row 1: flat 2d6 + stat modifiers
	const row1 = new ActionRowBuilder();
	row1.addComponents(
		new ButtonBuilder()
			.setCustomId('rhune:qr:pick:flat')
			.setLabel('2d6')
			.setStyle(ButtonStyle.Primary),
	);

	if (activeChar?.stats) {
		const stats = activeChar.stats;
		for (const key of ['str', 'dex', 'con']) {
			const val = stats[key] ?? 0;
			row1.addComponents(
				new ButtonBuilder()
					.setCustomId(`rhune:qr:pick:stat:${key}`)
					.setLabel(`${STAT_LABELS[key]} ${val > 0 ? '+' : ''}${val}`)
					.setStyle(ButtonStyle.Secondary),
			);
		}
	}
	rows.push(row1);

	// Row 2: remaining stats (if we have a character)
	if (activeChar?.stats) {
		const stats = activeChar.stats;
		const row2 = new ActionRowBuilder();
		for (const key of ['int', 'wis', 'cha']) {
			const val = stats[key] ?? 0;
			row2.addComponents(
				new ButtonBuilder()
					.setCustomId(`rhune:qr:pick:stat:${key}`)
					.setLabel(`${STAT_LABELS[key]} ${val > 0 ? '+' : ''}${val}`)
					.setStyle(ButtonStyle.Secondary),
			);
		}
		rows.push(row2);
	}

	// Cancel row
	const closeRow = new ActionRowBuilder();
	closeRow.addComponents(
		new ButtonBuilder()
			.setCustomId('rhune:qr:cancel')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Danger),
	);
	rows.push(closeRow);

	return { embed, components: rows };
}

// ─── Step 2: Mode picker ─────────────────────────────────────

/**
 * After picking a modifier, show normal/adv/dis buttons + confirm.
 */
function buildModePicker({ flat, statKey, modifier, statName, charName }) {
	const label = flat ? '2d6' : `2d6 + ${statName}`;
	const descParts = [];
	descParts.push(`Rolling **${label}**`);
	if (statName && charName) {
		descParts.push(`**${charName}** — ${statName} modifier: ${modifier > 0 ? '+' : ''}${modifier}`);
	}
	descParts.push('');
	descParts.push('Choose Normal, Advantage, or Disadvantage, then tap **Roll!**');

	const embed = new EmbedBuilder()
		.setColor(0x6b3fa0)
		.setTitle(`🎲 ${label}`)
		.setDescription(descParts.join('\n'));

	const prefix = flat ? 'rhune:qr:confirm:flat' : `rhune:qr:confirm:stat:${statKey}`;

	const modeRow = new ActionRowBuilder();
	modeRow.addComponents(
		new ButtonBuilder()
			.setCustomId(`${prefix}:normal`)
			.setLabel('Normal')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId(`${prefix}:adv`)
			.setLabel('Advantage')
			.setStyle(ButtonStyle.Success),
		new ButtonBuilder()
			.setCustomId(`${prefix}:dis`)
			.setLabel('Disadvantage')
			.setStyle(ButtonStyle.Danger),
	);

	const navRow = new ActionRowBuilder();
	navRow.addComponents(
		new ButtonBuilder()
			.setCustomId('rhune:qr:back')
			.setLabel('← Back')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(`${prefix}:normal`)
			.setLabel('Roll! ▶')
			.setStyle(ButtonStyle.Success),
	);

	return { embed, components: [modeRow, navRow] };
}

// ─── Execute roll ────────────────────────────────────────────

/**
 * Execute a quick roll with given options and return the reply payload.
 * @param {object} interaction
 * @param {number} modifier — stat modifier (0 for flat)
 * @param {string} mode — 'normal', 'adv', 'dis'
 * @param {string|null} statKey — 'str', 'dex', etc., or null for flat
 * @param {string|null} statName — display name like 'STR', null for flat
 * @param {string|null} charName — character name for display
 */
async function executeQuickRoll(interaction, { modifier, mode, statKey, statName, charName }) {
	const guildId = interaction.guildId;
	const userId = interaction.user.id;

	const result = roll2d6(mode);
	const total = result.total + modifier;

	const exprStr = statKey
		? `2d6+${modifier} (${statKey})`
		: `2d6${mode !== 'normal' ? ` ${mode}` : ''}`;

	const rollId = await logRoll({
		guildId,
		channelId: interaction.channelId,
		userId,
		commandName: 'roll',
		expr: exprStr,
		mode,
		result: { ...result, modifier, total },
	});

	const base = result.kept.reduce((a, b) => a + b, 0);

	let diceLine = result.rolls.join(', ');
	if (result.mode !== 'normal' && result.droppedIndex !== null) {
		const droppedVal = result.rolls[result.droppedIndex];
		diceLine = `${result.rolls.join(', ')} (dropped ${droppedVal})`;
	}

	const title = statName
		? `2d6 + ${statName}`
		: `2d6${mode !== 'normal' ? ` (${mode})` : ''}`;

	const descParts = [];
	if (statName && charName) {
		descParts.push(`**${charName}** — ${statName} modifier: ${modifier > 0 ? '+' : ''}${modifier}`);
	}
	if (mode === 'adv') descParts.push('Advantage (3d6 keep best 2)');
	if (mode === 'dis') descParts.push('Disadvantage (3d6 keep worst 2)');

	const embed = new EmbedBuilder()
		.setColor(0x6b3fa0)
		.setTitle(`🎲 ${title}`)
		.setDescription(descParts.join('\n'))
		.addFields(
			{ name: 'Roll', value: diceLine, inline: true },
			{ name: 'Base', value: String(base), inline: true },
			{ name: statName ? `Total (${statName})` : 'Total', value: String(total), inline: true },
		);

	withRollId(embed, rollId);

	const files = [];
	if (result.rolls.length >= 2) {
		try {
			const buf = await renderPbtaD6Strip({ rolls: result.rolls, droppedIndex: result.droppedIndex ?? null });
			const fileName = 'pbta-roll.png';
			files.push(new AttachmentBuilder(buf, { name: fileName }));
			embed.setThumbnail(`attachment://${fileName}`);
		}
		catch {
			// Image failed — no big deal
		}
	}

	return { embeds: [embed], files };
}

// ─── Command definition ──────────────────────────────────────

module.exports = {
	data: new SlashCommandBuilder()
		.setName('roll')
		.setDescription('Roll dice (supports basic expressions like d20, 2d6+1)')
		.addStringOption(option => option
			.setName('expr')
			.setDescription('Dice expression (e.g. d20, 2d6+1). Leave empty for the Quick Roll menu.')
			.setRequired(false))
		.addStringOption(option => option
			.setName('mode')
			.setDescription('Advantage/disadvantage: roll one extra die and drop lowest/highest')
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
		const expr = interaction.options.getString('expr');
		const mode = interaction.options.getString('mode') || 'normal';
		const hasExpr = interaction.options.getString('expr') !== null;

		try {
			async function buildReply({ embed, rollResult, rollId }) {
				const files = [];

				if (rollResult?.type === '2d6' && Array.isArray(rollResult.rolls)) {
					const buf = await renderPbtaD6Strip({ rolls: rollResult.rolls, droppedIndex: rollResult.droppedIndex ?? null });
					const fileName = 'pbta-roll.png';
					files.push(new AttachmentBuilder(buf, { name: fileName }));
					embed.setThumbnail(`attachment://${fileName}`);
					return { embeds: [withRollId(embed, rollId)], files };
				}

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

				await interaction.reply(await buildReply({ embed, rollResult: last.result, rollId: last.id }));
				return;
			}

			// No expression → Quick Roll menu (step 1)
			if (!hasExpr) {
				const { embed, components } = await buildModifierPicker(interaction.user.id, interaction.guildId);
				await interaction.reply({
					embeds: [embed],
					components,
					ephemeral: true,
				});
				return;
			}

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
				await interaction.reply(await buildReply({ embed, rollResult: { ...result, modifier }, rollId }));
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
			await interaction.reply(await buildReply({ embed, rollResult: result, rollId }));
		}
		catch (err) {
			await interaction.reply({ content: `Could not roll: ${err.message}`, ephemeral: true });
		}
	},
	// Exports for button handler
	buildModifierPicker,
	buildModePicker,
	executeQuickRoll,
};
