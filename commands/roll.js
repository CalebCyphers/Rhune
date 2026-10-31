const { SlashCommandBuilder, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const { rollPool, poolFromRolls, rollExpr, rollCommunity } = require('../lib/dice');
const { exprResultEmbed, poolEmbed, communityEmbed, withRollId } = require('../lib/format');
const { logRoll } = require('../lib/rolllog_pb');
const { diceImagePath, diceImageName } = require('../lib/dice_images');
const { renderD6Strip, renderDiceStrip } = require('../lib/pool_strip');
const { deferComponentUpdate } = require('../lib/interaction_helpers');

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

	if (result?.type === 'expr') {
		// Single die: show the face itself as a thumbnail.
		if (result.count === 1) {
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
			return files;
		}

		// Multiple dice: render a strip of that die type.
		try {
			const buf = await renderDiceStrip({
				sides: result.sides,
				rolls: result.rolls,
				droppedIndex: result.droppedIndex ?? null,
			});
			files.push(new AttachmentBuilder(buf, { name: 'roll.png' }));
			embed.setImage('attachment://roll.png');
		}
		catch {
			// image rendering failure — skip
		}
		return files;
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
 * Reroll button for a pool roll: the bust reroll (1s only). Shown whenever a
 * kept die came up 1 — including advantage/disadvantage pools (the dropped die
 * doesn't count, and `ones` is already computed on the kept dice).
 */
function rerollButtons(result) {
	if (!(result.ones > 0)) return [];
	const row = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:rr:ones:${encodeRolls(result.kept)}`)
			.setLabel('↻ Reroll the 1s')
			.setStyle(ButtonStyle.Primary),
	);
	return [row];
}

// ─── Roll builder ────────────────────────────────────────────
//
// /roll opens a builder: pick a die type, a count, and (optionally) advantage
// or disadvantage, then hit Roll. Results post to the channel; a pool that
// comes up with 1s offers a one-tap "reroll the 1s".

const BUILDER_DICE = [4, 6, 8, 10, 12];
const BUILDER_MAX = 20;

/** Encode builder state into a customId-safe token. */
function encodeBuilder({ sides, count, mode }) {
	return `${sides}-${count}-${mode}`;
}

/** Decode a builder token (defensive — falls back to 1d6 normal). */
function decodeBuilder(s) {
	const parts = String(s || '').split('-');
	const sides = Number.parseInt(parts[0], 10);
	const count = Number.parseInt(parts[1], 10);
	const mode = parts[2];
	return {
		sides: BUILDER_DICE.includes(sides) ? sides : 6,
		count: Number.isInteger(count) && count >= 1 ? Math.min(count, BUILDER_MAX) : 1,
		mode: ['normal', 'adv', 'dis', 'community'].includes(mode) ? mode : 'normal',
	};
}

/** Build the interactive roll builder for a given state. */
function buildRollBuilder(state = { sides: 6, count: 1, mode: 'normal' }) {
	const { sides, count } = state;
	const mode = state.mode || 'normal';
	const isCommunity = mode === 'community';
	const modeLabel = mode === 'adv' ? ' · **advantage**' : mode === 'dis' ? ' · **disadvantage**' : isCommunity ? ' · **community** (take highest)' : '';
	const preview = isCommunity ? `Community · **${count}d6, take the highest**` : `**${count}d${sides}**${modeLabel}`;

	const embed = new EmbedBuilder()
		.setColor(0x6b3fa0)
		.setTitle('🎲 Roll')
		.setDescription(`Pick your dice, then hit **Roll**.\n\n${preview}`);

	// Die-type buttons (all dice in the first row).
	const dieRow1 = new ActionRowBuilder();
	for (const d of BUILDER_DICE) {
		dieRow1.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:rb:die:${encodeBuilder({ sides: d, count, mode })}`)
				.setLabel(`d${d}`)
				.setStyle(d === sides ? ButtonStyle.Primary : ButtonStyle.Secondary),
		);
	}

	// Second row: count controls.
	const dieRow2 = new ActionRowBuilder();
	dieRow2.addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:rb:count:${encodeBuilder({ sides, count: Math.max(1, count - 1), mode })}`)
			.setLabel('−')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(count <= 1),
		new ButtonBuilder()
			.setCustomId('rhune:rb:noop')
			.setLabel(`${count}d${sides}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(`rhune:rb:count:${encodeBuilder({ sides, count: Math.min(BUILDER_MAX, count + 1), mode })}`)
			.setLabel('+')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(count >= BUILDER_MAX),
	);

	const modeRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:rb:mode:${encodeBuilder({ sides, count, mode: 'adv' })}`)
			.setLabel('Advantage')
			.setStyle(mode === 'adv' ? ButtonStyle.Success : ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(`rhune:rb:mode:${encodeBuilder({ sides, count, mode: 'dis' })}`)
			.setLabel('Disadvantage')
			.setStyle(mode === 'dis' ? ButtonStyle.Danger : ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(`rhune:rb:mode:${encodeBuilder({ sides, count, mode: 'community' })}`)
			.setLabel('Community')
			.setStyle(isCommunity ? ButtonStyle.Primary : ButtonStyle.Secondary),
		new ButtonBuilder()
			.setCustomId(`rhune:rb:mode:${encodeBuilder({ sides, count, mode: 'normal' })}`)
			.setLabel('Reset')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(mode === 'normal'),
	);

	const actionRow = new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:rb:roll:${encodeBuilder(state)}`)
			.setLabel('🎲 Roll')
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId('rhune:rb:cancel')
			.setLabel('Cancel')
			.setStyle(ButtonStyle.Secondary),
	);

	return { embed, components: [dieRow1, dieRow2, modeRow, actionRow] };
}

/** Post a finished roll to the channel (shared by the builder's paths). */
async function postRollResult(interaction, { result, embed, components, expr, mode }) {
	// Ack the button within Discord's 3s window before the PocketBase write.
	await deferComponentUpdate(interaction);

	const rollId = await logRoll({
		guildId: interaction.guildId,
		channelId: interaction.channelId,
		userId: interaction.user.id,
		commandName: 'roll',
		expr,
		mode,
		result,
	});

	const payload = await buildReply(embed, result, rollId, components);

	if (interaction.guildId) {
		const channel = interaction.channel
			?? await interaction.client.channels.fetch(interaction.channelId);
		if (!channel?.isTextBased?.()) throw new Error('Channel is not text-based.');
		try {
			await channel.send(payload);
			await interaction.editReply({ content: '✅ Rolled!', embeds: [], components: [] });
		}
		catch (err) {
			console.error('Roll public post failed:', err?.message || err);
			await interaction.editReply({ content: '✅ Rolled!', embeds: payload.embeds, files: payload.files, components: payload.components });
		}
	}
	else {
		await interaction.editReply({ content: '✅ Rolled!', embeds: payload.embeds, files: payload.files, components: payload.components });
	}
	return result;
}

/** Roll whatever the builder is configured for, then post it. */
async function executeBuilderRoll(interaction, state) {
	const { sides, count, mode } = state;

	// Community roll — always d6, take the highest (steading/Fortunes rolls).
	if (mode === 'community') {
		const result = rollCommunity({ count, mode: 'normal' });
		return postRollResult(interaction, {
			result,
			embed: communityEmbed(result),
			components: [],
			expr: `community:${count}`,
			mode: 'normal',
		});
	}

	if (sides === 6) {
		const result = rollPool({ count, mode });
		return postRollResult(interaction, {
			result,
			embed: poolEmbed(result),
			components: rerollButtons(result),
			expr: `pool:${count}${mode !== 'normal' ? ` ${mode}` : ''}`,
			mode: result.mode,
		});
	}

	const result = rollExpr(`${count}d${sides}`, mode === 'normal' ? null : mode);
	return postRollResult(interaction, {
		result,
		embed: exprResultEmbed(result),
		components: [],
		expr: `${count}d${sides}${mode !== 'normal' ? ` ${mode}` : ''}`,
		mode: result.mode,
	});
}


// ─── Command definition ──────────────────────────────────────

/**
 * Roll a pool (fresh, or from a provided set of kept dice), log it, and post
 * the result to the channel. Shared by the quick menu and the reroll buttons.
 */
async function executePoolRoll(interaction, { count, mode = 'normal', keptRolls = null }) {
	// Ack the button within Discord's 3s window before the PocketBase write.
	await deferComponentUpdate(interaction);

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
			await interaction.editReply({ content: '✅ Rolled!', embeds: [], components: [] });
		}
		catch (err) {
			console.error('Pool roll public post failed:', err?.message || err);
			await interaction.editReply({ content: '✅ Rolled!', embeds: payload.embeds, files: payload.files, components: payload.components });
		}
	}
	else {
		await interaction.editReply({ content: '✅ Rolled!', embeds: payload.embeds, files: payload.files, components: payload.components });
	}
	return result;
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('roll')
		.setDescription('Open the roll builder — dice, advantage/disadvantage, then roll'),
	async execute(interaction) {
		try {
			// Open the roll builder.
			const { embed, components } = buildRollBuilder();
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

	buildRollBuilder,
	decodeBuilder,
	executeBuilderRoll,
	buildReply,
	rerollButtons,
	decodeRolls,
	encodeRolls,
	executePoolRoll,
};
