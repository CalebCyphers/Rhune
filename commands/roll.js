const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { rollPool, poolFromRolls, rollExpr, rollCommunity, POOL_MAX } = require('../lib/dice');
const { exprResultEmbed, poolEmbed, communityEmbed, withRollId } = require('../lib/format');
const { getLastRoll, logRoll } = require('../lib/rolllog_pb');
const { diceImagePath, diceImageName } = require('../lib/dice_images');
const { renderD6Strip } = require('../lib/pool_strip');

const MODE_CHOICES = [
	{ name: 'normal', value: 'normal' },
	{ name: 'advantage', value: 'adv' },
	{ name: 'disadvantage', value: 'dis' },
];

// ─── Attachments ─────────────────────────────────────────────

/**
 * Attach the color-coded d6 strip for a pool or community roll, or a single
 * d6/d20 face image for a simple expression.
 */
async function buildDiceAttachments(result, embed) {
	const files = [];

	if (result?.type === 'pool' || result?.type === 'community') {
		try {
			const buf = await renderD6Strip({
				rolls: result.rolls,
				droppedIndex: result.droppedIndex ?? null,
				resultIndex: result.type === 'community' ? result.resultIndex : null,
			});
			files.push(new AttachmentBuilder(buf, { name: 'roll.png' }));
			embed.setImage('attachment://roll.png');
		}
		catch {
			// image rendering failure — skip
		}
		return files;
	}

	if (
		result?.type === 'expr'
		&& result.count === 1
		&& (result.sides === 6 || result.sides === 20)
	) {
		try {
			const face = result.rolls?.[0];
			const filePath = diceImagePath({ sides: result.sides, face });
			const fileName = diceImageName({ sides: result.sides, face });
			if (filePath && fileName) {
				files.push(new AttachmentBuilder(filePath, { name: fileName }));
				embed.setThumbnail(`attachment://${fileName}`);
			}
		}
		catch {
			// image not available — skip
		}
	}

	return files;
}

async function buildReply(embed, result, rollId, components = []) {
	const files = await buildDiceAttachments(result, embed);
	const payload = { embeds: [withRollId(embed, rollId)], files };
	if (components.length) payload.components = components;
	return payload;
}

// ─── Reroll buttons (stateless: the dice live in the customId) ─

/** Encode a set of dice faces into a customId-safe string. */
function encodeRolls(rolls) {
	return rolls.join('-');
}

function decodeRolls(s) {
	return String(s).split('-').map(v => Number.parseInt(v, 10)).filter(v => Number.isInteger(v));
}

/**
 * Reroll buttons for a pool roll. Only shown for normal-mode pools, since the
 * bust reroll is about the dice showing 1.
 */
function rerollButtons(result) {
	if (result.mode !== 'normal') return [];
	const row = new ActionRowBuilder();
	if (result.ones > 0) {
		row.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:rr:ones:${encodeRolls(result.kept)}`)
				.setLabel('↻ Reroll the 1s')
				.setStyle(ButtonStyle.Primary),
		);
	}
	row.addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:rr:all:${result.count}:${result.mode}`)
			.setLabel('↻ Reroll all')
			.setStyle(ButtonStyle.Secondary),
	);
	return [row];
}

// ─── Quick menu ──────────────────────────────────────────────

function buildQuickMenu(mode = 'normal') {
	const modeLabel = mode === 'adv' ? ' — Advantage' : mode === 'dis' ? ' — Disadvantage' : '';
	const embed = new EmbedBuilder()
		.setColor(0x6b3fa0)
		.setTitle(`🎲 Push Your Luck${modeLabel}`)
		.setDescription('Pick your pool size — your pool starts at **1** and grows by 1 for each risky move this turn.');

	const row1 = new ActionRowBuilder();
	for (let n = 1; n <= 5; n++) {
		row1.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:qr:pool:${n}:${mode}`)
				.setLabel(`${n}d6`)
				.setStyle(ButtonStyle.Primary),
		);
	}
	const row2 = new ActionRowBuilder();
	row2.addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:qr:pool:6:${mode}`)
			.setLabel('6d6')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId('rhune:qr:menu:adv')
			.setLabel('Advantage')
			.setStyle(mode === 'adv' ? ButtonStyle.Success : ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId('rhune:qr:menu:dis')
			.setLabel('Disadvantage')
			.setStyle(mode === 'dis' ? ButtonStyle.Danger : ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId('rhune:qr:menu:normal')
			.setLabel('Reset')
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId('rhune:qr:cancel')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary),
	);

	return { embed, components: [row1, row2] };
}

// ─── Command definition ──────────────────────────────────────

/**
 * Roll a pool (fresh, or from a provided set of kept dice), log it, and post
 * the result to the channel. Shared by the quick menu and the reroll buttons.
 */
async function executePoolRoll(interaction, { count, mode = 'normal', keptRolls = null }) {
	const result = keptRolls
		? poolFromRolls(keptRolls, { count: keptRolls.length, mode: 'normal' })
		: rollPool({ count, mode });

	const rollId = await logRoll({
		guildId: interaction.guildId,
		channelId: interaction.channelId,
		userId: interaction.user.id,
		commandName: 'roll',
		expr: `pool:${result.count}${result.mode !== 'normal' ? ` ${result.mode}` : ''}`,
		mode: result.mode,
		result,
	});

	const payload = await buildReply(poolEmbed(result), result, rollId, rerollButtons(result));

	if (interaction.guildId) {
		const channel = interaction.channel
			?? await interaction.client.channels.fetch(interaction.channelId);
		if (!channel?.isTextBased?.()) throw new Error('Channel is not text-based.');
		try {
			await channel.send(payload);
			await interaction.update({ content: '✅ Rolled!', embeds: [], components: [], flags: 64 });
		}
		catch (err) {
			console.error('Pool roll public post failed:', err?.message || err);
			await interaction.update({ content: '✅ Rolled!', embeds: payload.embeds, files: payload.files, components: payload.components, flags: 64 });
		}
	}
	else {
		await interaction.update({ content: '✅ Rolled!', embeds: payload.embeds, files: payload.files, components: payload.components, flags: 64 });
	}
	return result;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('roll')
		.setDescription('Roll dice — a push-your-luck pool, a plain expression, or a community roll')
		.addIntegerOption(option => option
			.setName('pool')
			.setDescription('Push your luck: roll this many d6 (your pool size)')
			.setRequired(false)
			.setMinValue(1)
			.setMaxValue(POOL_MAX))
		.addStringOption(option => option
			.setName('expr')
			.setDescription('A plain dice expression (e.g. d20, 2d6+1)')
			.setRequired(false))
		.addIntegerOption(option => option
			.setName('community')
			.setDescription('Community roll: roll this many d6, take the highest (0 = broken: 2d6, lowest)')
			.setRequired(false)
			.setMinValue(0)
			.setMaxValue(POOL_MAX))
		.addStringOption(option => option
			.setName('mode')
			.setDescription('Advantage/disadvantage (extra die, drop lowest/highest)')
			.setRequired(false)
			.addChoices(...MODE_CHOICES))
		.addBooleanOption(option => option
			.setName('last')
			.setDescription('Show your most recent roll')
			.setRequired(false)),
	async execute(interaction) {
		const showLast = interaction.options.getBoolean('last') || false;
		const pool = interaction.options.getInteger('pool');
		const community = interaction.options.getInteger('community');
		const expr = interaction.options.getString('expr');
		const mode = interaction.options.getString('mode') || 'normal';
		const hasExpr = interaction.options.getString('expr') !== null;

		const { guildId, channelId } = interaction;
		const userId = interaction.user.id;

		try {
			if (showLast) {
				const last = await getLastRoll({ guildId, userId });
				if (!last) {
					await interaction.reply({ content: 'No previous rolls found for you in this server yet.', ephemeral: true });
					return;
				}
				const r = last.result;
				const embed = r?.type === 'pool' ? poolEmbed(r)
					: r?.type === 'community' ? communityEmbed(r)
						: exprResultEmbed(r);
				const components = r?.type === 'pool' ? rerollButtons(r) : [];
				await interaction.reply(await buildReply(embed, r, last.id, components));
				return;
			}

			// Community roll.
			if (community !== null) {
				const result = rollCommunity({ count: community, mode });
				const rollId = await logRoll({
					guildId, channelId, userId,
					commandName: 'roll',
					expr: `community:${community}${mode !== 'normal' ? ` ${mode}` : ''}`,
					mode,
					result,
				});
				await interaction.reply(await buildReply(communityEmbed(result), result, rollId));
				return;
			}

			// Plain expression.
			if (hasExpr) {
				const modeOverride = mode === 'normal' ? null : mode;
				const result = rollExpr(expr, modeOverride);
				const rollId = await logRoll({
					guildId, channelId, userId,
					commandName: 'roll',
					expr,
					mode: result.mode,
					result,
				});
				await interaction.reply(await buildReply(exprResultEmbed(result), result, rollId));
				return;
			}

			// Push-your-luck pool.
			if (pool !== null) {
				const result = rollPool({ count: pool, mode });
				const rollId = await logRoll({
					guildId, channelId, userId,
					commandName: 'roll',
					expr: `pool:${pool}${mode !== 'normal' ? ` ${mode}` : ''}`,
					mode,
					result,
				});
				await interaction.reply(await buildReply(poolEmbed(result), result, rollId, rerollButtons(result)));
				return;
			}

			// No options → quick menu.
			const { embed, components } = buildQuickMenu();
			await interaction.reply({ embeds: [embed], components, ephemeral: true });
		}
		catch (err) {
			await interaction.reply({ content: `Could not roll: ${err.message}`, ephemeral: true });
		}
	},

	// ── Exports for the button handler in index.js ──

	/** Reroll the dice showing 1 (the bust reroll). */
	rerollOnes(rolls) {
		return rolls.map(v => (v === 1 ? rollPool({ count: 1 }).kept[0] : v));
	},

	/** Roll a fresh pool of the given size/mode (used by "reroll all"). */
	rerollAll(count, mode) {
		return rollPool({ count, mode });
	},

	buildQuickMenu,
	buildReply,
	rerollButtons,
	decodeRolls,
	encodeRolls,
	executePoolRoll,
};
