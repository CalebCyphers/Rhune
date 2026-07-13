require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const deployCommands = async () => {
	try {
		if (!process.env.BOT_TOKEN) throw new Error('BOT_TOKEN is required');
		if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID is required');
		const allCommands = [];

		const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

		for (const file of commandFiles) {
			const command = require(`./commands/${file}`);
			if ('data' in command && 'execute' in command) {
				allCommands.push(command.data.toJSON());
			}
			else {
				console.log(
					`WARNING: The command at ${file} is missing a required 'data' or 'execute' property.`,
					Object.prototype.hasOwnProperty.call(command, 'data'),
					Object.prototype.hasOwnProperty.call(command, 'execute'),
				);
			}
		}

		const rest = new REST().setToken(process.env.BOT_TOKEN);

		// Optional fast iteration path: deploy to a single guild if GUILD_ID is set.
		// Otherwise, deploy globally (current behavior).
		const guildId = process.env.GUILD_ID;

		if (guildId) {
			console.log(`Started refreshing ${allCommands.length} application slash commands for guild ${guildId}`);
			await rest.put(
				Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
				{ body: allCommands },
			);
			console.log('Successfully reloaded all guild commands!');
		}
		else {
			console.log(`Started refreshing ${allCommands.length} application slash commands globally`);
			await rest.put(
				Routes.applicationCommands(process.env.CLIENT_ID),
				{ body: allCommands },
			);
			console.log('Successfully reloaded all global commands!');
		}
	}
	catch (error) {
		console.error('Error deploying commands:', error);
		throw error;
	}
};

const {
	Client,
	GatewayIntentBits,
	Partials,
	Collection,
	PresenceUpdateStatus,
	Events,
} = require('discord.js');

const { parsePickCharCustomId } = require('./lib/disambiguation');
const { getPending, clearPending } = require('./lib/pending_actions');
const { getCharacterById } = require('./lib/characters_pb');
const { renderCharacterSheetEmbed } = require('./lib/character_embed');
const { getWizard, clearWizard, selectPlaybook, selectBackground, selectInstinct, selectPoolValue, assignStat, toggleMove, setOrChoice, getStepInfo, advanceStep, backStep } = require('./lib/create_wizard');
const { createCharacter, setActiveCharacter } = require('./lib/characters_pb');
const { replyEphemeral, updateClearComponents } = require('./lib/interaction_helpers');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
	],
	partials: [
		Partials.Channel,
		Partials.Message,
		Partials.User,
		Partials.GuildMember,
	],
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);

	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	}
	else {
		console.log(`The Command ${filePath} is missing a required "data" or "execute" property.`);
	}
}

const { pbDiagnostics } = require('./lib/pb_diagnostics');

client.once(Events.ClientReady, async () => {
	console.log(`Ready! Logged in as ${client.user.tag}`);

	const deployOnly = process.argv.includes('--deploy-commands');

	// Optional PocketBase diagnostics (PB_DEBUG=1)
	await pbDiagnostics();

	// Deploy Commands
	await deployCommands();

	// In deploy-only mode, exit cleanly after registration.
	if (deployOnly) {
		console.log('Deploy-only run complete; exiting.');
		await client.destroy();
		process.exit(0);
	}

	const statusType = process.env.BOT_STATUS || 'online';

	const statusMap = {
		'online': PresenceUpdateStatus.Online,
		'idle': PresenceUpdateStatus.Idle,
		'dnd': PresenceUpdateStatus.DoNotDisturb,
		'invisible': PresenceUpdateStatus.Invisible,
	};

	const mappedStatus = statusMap[statusType] || PresenceUpdateStatus.Online;
	client.user.setPresence({ status: mappedStatus });

	console.log(`Bot status set to ${statusType}`);
});

client.on(Events.InteractionCreate, async interaction => {
	if (interaction.isButton()) {
		// Playbook button: rhune:playbook:<charId>
		if (interaction.customId.startsWith('rhune:playbook:')) {
			try {
				const charId = interaction.customId.slice('rhune:playbook:'.length);
				const record = await getCharacterById({ id: charId });

				const { lookupPlaybook, renderPlaybookEmbed, getCharacterMoveList } = require('./lib/playbooks');
				const pb = lookupPlaybook(record.playbook);
				const embed = renderPlaybookEmbed(record);
				if (!embed) {
					await replyEphemeral(interaction, 'No playbook info found for this character.');
					return;
				}

				const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
				const moveList = getCharacterMoveList(record, pb);
				const maxButtons = 25;
				const maxMoves = Math.min(moveList.length, maxButtons);
				const components = [];

				let row = new ActionRowBuilder();
				for (let i = 0; i < maxMoves; i++) {
					const moveName = moveList[i];
					const safeName = String(moveName).slice(0, 80);
					row.addComponents(
						new ButtonBuilder()
							.setCustomId(`rhune:rollmove:${record.id}:${moveName}`)
							.setLabel(`Roll: ${safeName}`.slice(0, 80))
							.setStyle(ButtonStyle.Secondary),
					);

					if (row.components.length === 5) {
						components.push(row);
						row = new ActionRowBuilder();
						if (components.length === 5) break;
					}
				}
				if (row.components.length && components.length < 5) components.push(row);

				// Reply in the same ephemeral thread as the sheet.
				await interaction.reply({ embeds: [embed], components, ephemeral: true });
			}
			catch (err) {
				console.error(err);
				await replyEphemeral(interaction, `Error: ${err.message}`);
			}
			return;
		}

		// === Creation wizard buttons ===
		if (interaction.customId.startsWith('rhune:create:')) {
			const wizardId = interaction.user.id;
			const wizard = getWizard(wizardId);
			if (!wizard) {
				await replyEphemeral(interaction, 'No active character creation. Please start with /char create.');
				return;
			}

			try {
				const action = interaction.customId.replace('rhune:create:', '').split(':')[0];
				const value = interaction.customId.split(':').slice(3).join(':');
				const { buildWizardStep } = require('./commands/char');

				switch (action) {
				case 'pickpb':
					selectPlaybook(wizardId, value);
					break;
				case 'pickbg':
					selectBackground(wizardId, value);
					break;
				case 'pickinstinct':
					selectInstinct(wizardId, value);
					break;
				case 'togglemove':
					toggleMove(wizardId, value);
					break;
				case 'orchoice': {
					const parts = interaction.customId.split(':');
					const groupIdx = parseInt(parts[3], 10);
					const moveName = parts.slice(4).join(':');
					const wiz = getWizard(wizardId);
					if (wiz?.orChoices?.[groupIdx] === moveName) {
						setOrChoice(wizardId, groupIdx, null);
					}
					else {
						setOrChoice(wizardId, groupIdx, moveName);
					}
					break;
				}
				case 'selectpool': {
					// format: rhune:create:selectpool:<index>:<value>
					const poolParts = interaction.customId.split(':').slice(3);
					const poolIndex = parseInt(poolParts[0], 10);
					const poolVal = poolParts.slice(1).join(':');
					selectPoolValue(wizardId, poolIndex, poolVal);
					break;
				}
				case 'assignstat':
					assignStat(wizardId, value);
					break;
				case 'back':
					backStep(wizardId);
					break;
				case 'confirm':
					advanceStep(wizardId);
					break;
				case 'finalize': {
					const state = getWizard(wizardId);
					if (!state) {
						await replyEphemeral(interaction, 'Session expired. Please start again with /char create.');
						return;
					}

					const allMoves = [
						...state.grantedMoves,
						...Object.keys(state.playbookData.startingMoves),
						...Object.values(state.orChoices || {}).filter(Boolean),
						...state.chosenMoves,
					];

					const choices = {
						playbook: state.playbookKey,
						background: state.background,
						instinct: state.instinct,
						chosen_moves: allMoves,
					};

					const maxHp = state.playbookData.creationRules?.maxHP || 20;

					const record = await createCharacter({
						guildId: state.guildId,
						ownerUserId: state.userId,
						name: state.name,
						playbook: state.playbookKey,
						stats: { ...state.stats },
						hp: maxHp,
						hpMax: maxHp,
						xp: 0,
						loadCurrent: 0,
						loadMax: 0,
						choices,
					});

					await setActiveCharacter({ guildId: state.guildId, userId: state.userId, characterId: record.id });
					clearWizard(wizardId);

					const embed = await renderCharacterSheetEmbed(record);

					// Sheet action buttons
					const { lookupPlaybook: lp } = require('./lib/playbooks');
					const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
					const components = [];
					const row = new ActionRowBuilder();

					if (record.playbook && lp(record.playbook)) {
						row.addComponents(
							new ButtonBuilder()
								.setCustomId(`rhune:playbook:${record.id}`)
								.setLabel('Playbook')
								.setStyle(ButtonStyle.Primary),
						);
					}

					row.addComponents(
						new ButtonBuilder()
							.setCustomId(`rhune:edit:${record.id}`)
							.setLabel('Edit')
							.setStyle(ButtonStyle.Secondary),
					);

					components.push(row);

					await interaction.update({ embeds: [embed], components, flags: 64 });
					return;
				}
				case 'cancel':
					clearWizard(wizardId);
					await interaction.update({
						embeds: [new (require('discord.js').EmbedBuilder)().setDescription('Character creation cancelled.')],
						components: [],
						flags: 64,
					});
					return;
				}

				const step = getStepInfo(wizardId);
				const result = buildWizardStep(interaction, step);
				await interaction.update({ embeds: result.embeds, components: result.components, flags: 64 });
			}
			catch (err) {
				console.error(err);
				await replyEphemeral(interaction, `Error: ${err.message}`);
			}
			return;
		}

		// Roll a move: rhune:rollmove:<charId>:<moveName>
		if (interaction.customId.startsWith('rhune:rollmove:')) {
			try {
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const moveName = parts.slice(3).join(':');

				const record = await getCharacterById({ id: charId });
				if (record.guild_id !== interaction.guildId) {
					await replyEphemeral(interaction, 'That character is not from this server.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}

				const { getMoveRollStat, getStatMod, statLabel } = require('./lib/move_rolls');
				const statKey = getMoveRollStat(moveName);
				if (!statKey) {
					await replyEphemeral(interaction, `No roll mapping found for **${moveName}** yet.`);
					return;
				}

				const mod = getStatMod(record.stats, statKey);
				const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
				const embed = new EmbedBuilder()
					.setTitle(`Roll Move: ${moveName}`)
					.setDescription(`Character: **${record.name}**\nStat: **${statLabel(statKey)}** (${mod >= 0 ? '+' : ''}${mod})`)
					.setTimestamp(new Date());

				const row = new ActionRowBuilder()
					.addComponents(
						new ButtonBuilder()
							.setCustomId(`rhune:rollconfirm:${charId}:${moveName}:normal`)
							.setLabel('Roll')
							.setStyle(ButtonStyle.Primary),
						new ButtonBuilder()
							.setCustomId(`rhune:rollconfirm:${charId}:${moveName}:adv`)
							.setLabel('Adv')
							.setStyle(ButtonStyle.Secondary),
						new ButtonBuilder()
							.setCustomId(`rhune:rollconfirm:${charId}:${moveName}:dis`)
							.setLabel('Dis')
							.setStyle(ButtonStyle.Secondary),
						new ButtonBuilder()
							.setCustomId('rhune:rollconfirm:cancel')
							.setLabel('Cancel')
							.setStyle(ButtonStyle.Danger),
					);

				await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
			}
			catch (err) {
				console.error(err);
				await replyEphemeral(interaction, `Error: ${err.message}`);
			}
			return;
		}

		// Confirm roll: rhune:rollconfirm:<charId>:<moveName>:<mode>
		if (interaction.customId.startsWith('rhune:rollconfirm:')) {
			try {
				if (interaction.customId === 'rhune:rollconfirm:cancel') {
					await interaction.update({ content: 'Cancelled.', embeds: [], components: [], flags: 64 });
					return;
				}

				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const mode = parts[parts.length - 1];
				const moveName = parts.slice(3, -1).join(':');

				const record = await getCharacterById({ id: charId });
				if (record.guild_id !== interaction.guildId) {
					await replyEphemeral(interaction, 'That character is not from this server.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}

				const { getMoveRollStat, getStatMod, statLabel } = require('./lib/move_rolls');
				const statKey = getMoveRollStat(moveName);
				if (!statKey) {
					await replyEphemeral(interaction, `No roll mapping found for **${moveName}** yet.`);
					return;
				}

				const mod = getStatMod(record.stats, statKey);
				const { roll2d6 } = require('./lib/dice');
				const { twoD6Embed, withRollId } = require('./lib/format');
				const { renderPbtaD6Strip } = require('./lib/pbta_roll_strip');
				const { AttachmentBuilder } = require('discord.js');
				const { logRoll } = require('./lib/rolllog_pb');

				const result = roll2d6(mode);
				const rollId = await logRoll({
					guildId: interaction.guildId,
					channelId: interaction.channelId,
					userId: interaction.user.id,
					commandName: 'move',
					expr: `2d6${mod >= 0 ? '+' : ''}${mod}`,
					mode,
					result: { ...result, modifier: mod, move: moveName, stat: statLabel(statKey) },
				});

				const embed = withRollId(twoD6Embed(result, mod), rollId)
					.setTitle(`Move: ${moveName}`)
					.setDescription(`**${record.name}** rolling +${statLabel(statKey)} (${mod >= 0 ? '+' : ''}${mod})`);

				const buf = await renderPbtaD6Strip({ rolls: result.rolls, droppedIndex: result.droppedIndex ?? null });
				const fileName = 'pbta-roll.png';
				const file = new AttachmentBuilder(buf, { name: fileName });
				embed.setThumbnail(`attachment://${fileName}`);

				// First, update the ephemeral confirmation so it doesn’t linger.
				await interaction.update({ content: 'Rolled.', embeds: [], components: [], flags: 64 });

				// Then, post the actual roll publicly.
				await interaction.followUp({ embeds: [embed], files: [file], ephemeral: false });
			}
			catch (err) {
				console.error(err);
				await replyEphemeral(interaction, `Error: ${err.message}`);
			}
			return;
		}

		const parsed = parsePickCharCustomId(interaction.customId);
		if (!parsed) return;

		try {
			const pending = getPending(interaction.user.id);
			if (!pending || pending.action !== parsed.action) {
				await replyEphemeral(interaction, 'That selection has expired. Please re-run the command.');
				return;
			}

			const record = await getCharacterById({ id: parsed.charId });
			if (record.guild_id !== interaction.guildId) {
				await replyEphemeral(interaction, 'That character is not from this server.');
				return;
			}
			if (record.owner_user_id !== interaction.user.id) {
				await replyEphemeral(interaction, 'You do not own that character.');
				return;
			}

			const { doCharAction } = require('./lib/char_ops');
			const result = await doCharAction({
				action: pending.action,
				guildId: interaction.guildId,
				userId: interaction.user.id,
				charId: record.id,
				payload: pending.payload,
			});
			clearPending(interaction.user.id);

			if (result.type === 'text') {
				await updateClearComponents(interaction, { content: result.content });
				return;
			}
			if (result.type === 'record') {
				const embed = await renderCharacterSheetEmbed(result.record);
				await updateClearComponents(interaction, { content: 'Done.', embeds: [embed] });
				return;
			}

			await interaction.reply({ content: 'Unknown action.', ephemeral: true });
		}
		catch (err) {
			console.error(err);
			await replyEphemeral(interaction, `Error: ${err.message}`);
		}
		return;
	}

	// === Creation wizard select menus ===
	if (interaction.isStringSelectMenu() && interaction.customId === 'rhune:create:selectmove') {
		const wizardId = interaction.user.id;
		const wizard = getWizard(wizardId);
		if (!wizard) {
			await replyEphemeral(interaction, 'No active character creation. Please start with /char create.');
			return;
		}
		try {
			wizard.chosenMoves = interaction.values;
			const { buildWizardStep } = require('./commands/char');
			const step = getStepInfo(wizardId);
			const result = buildWizardStep(interaction, step);
			await interaction.update({ embeds: result.embeds, components: result.components, flags: 64 });
		}
		catch (err) {
			console.error(err);
			await replyEphemeral(interaction, `Error: ${err.message}`);
		}
		return;
	}

	if (!interaction.isChatInputCommand()) return;

	const command = client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}


	try {
		await command.execute(interaction);
	}
	catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command.', ephemeral:true });
		}
		else {
			await interaction.reply({ content: 'There was an error while executing this command.', ephemeral:true });
		}
	}
});

client.login(process.env.BOT_TOKEN);