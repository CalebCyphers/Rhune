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
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
} = require('discord.js');

const { parsePickCharCustomId } = require('./lib/disambiguation');
const { getPending, clearPending } = require('./lib/pending_actions');
const { getCharacterById } = require('./lib/characters_pb');
const { renderCharacterSheetEmbed } = require('./lib/character_embed');
const { getWizard, clearWizard, selectPlaybook, selectBackground, selectInstinct, selectPoolValue, assignStat, toggleMove, setOrChoice, togglePossession, getStepInfo, advanceStep, backStep } = require('./lib/create_wizard');
const { createCharacter, setActiveCharacter, updateCharacter } = require('./lib/characters_pb');
const { replyEphemeral, updateClearComponents, handleError } = require('./lib/interaction_helpers');
const { lookupPlaybook, renderPlaybookEmbed, buildPlaybookNav } = require('./lib/playbooks');
const { buildWizardStep } = require('./commands/char');
const { doCharAction } = require('./lib/char_ops');
const { moves, categoryNames, getCategoryLabel, getMove, buildMoveNav, buildMovePicker } = require('./lib/moves_data');

const { pbDiagnostics } = require('./lib/pb_diagnostics');

// Import quick-roll helper from the roll command
const rollCommand = require('./commands/roll');

/**
 * Build the Edit view embed and components for a character.
 */
function buildEditView(record) {

	const debils = Array.isArray(record.debilities)
		? record.debilities.filter(Boolean)
		: [];

	const allDebilities = ['Weakened', 'Dazed', 'Miserable'];
	const debilDesc = allDebilities.map(d => `${debils.includes(d) ? '☑' : '☐'} ${d}`).join('\n');

	const editEmbed = new EmbedBuilder()
		.setTitle(`Editing: ${record.name}`)
		.setDescription([
			`**HP:** \`${record.hp ?? '?'}/${record.hp_max ?? '?'}\``,
			`**XP:** \`${record.xp ?? 0}\``,
			`**Debilities:**\n${debilDesc}`,
		].join('\n'))
		.setTimestamp(new Date());

	const hpRow = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:edithp:${record.id}:-`)
				.setLabel('HP −1')
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId(`rhune:edithp:${record.id}:+`)
				.setLabel('HP +1')
				.setStyle(ButtonStyle.Success),
		);

	const xpRow = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:editxp:${record.id}:-`)
				.setLabel('XP −1')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(`rhune:editxp:${record.id}:+`)
				.setLabel('XP +1')
				.setStyle(ButtonStyle.Secondary),
		);

	const debilRow = new ActionRowBuilder();
	for (const d of allDebilities) {
		const isActive = debils.includes(d);
		debilRow.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:editdebil:${record.id}:${d}`)
				.setLabel(`${isActive ? '☑' : '☐'} ${d}`)
				.setStyle(isActive ? ButtonStyle.Danger : ButtonStyle.Secondary),
		);
	}

	const doneRow = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:editdone:${record.id}`)
				.setLabel('Done')
				.setStyle(ButtonStyle.Primary),
		);

	return {
		editEmbed,
		editComponents: [hpRow, xpRow, debilRow, doneRow],
	};
}

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
		// === Quick Roll buttons: rhune:qr:* ===
		if (interaction.customId.startsWith('rhune:qr:')) {
			try {
				const parts = interaction.customId.split(':');
				const action = parts[2];
				// pick, confirm, back, cancel

				// Cancel — dismiss the menu
				if (action === 'cancel') {
					await interaction.update({ content: 'Cancelled.', embeds: [], components: [], flags: 64 });
					return;
				}

				// Back — return to modifier picker
				if (action === 'back') {
					const { embed, components } = await rollCommand.buildModifierPicker(
						interaction.user.id, interaction.guildId,
					);
					await interaction.update({ embeds: [embed], components, flags: 64 });
					return;
				}

				// Pick — user chose a modifier, show mode picker
				if (action === 'pick') {
					const kind = parts[3];
					// 'flat' or 'stat'
					const flat = kind === 'flat';
					const statKey = flat ? null : parts[4];

					const { modifier, statName, charName } = await rollCommand.resolveStatInfo(
						interaction.user.id, interaction.guildId, statKey,
					);

					const { embed, components } = rollCommand.buildModePicker({
						flat,
						statKey,
						modifier,
						statName,
						charName,
					});
					await interaction.update({ embeds: [embed], components, flags: 64 });
					return;
				}

				// Confirm/Roll — execute the roll
				if (action === 'confirm' || action === 'roll') {
					const kind = parts[3];
					// 'flat' or 'stat'
					const statKey = kind === 'stat' ? parts[4] : null;
					const mode = kind === 'stat' ? parts[5] : parts[4];

					const { modifier, statName, charName } = await rollCommand.resolveStatInfo(
						interaction.user.id, interaction.guildId, statKey,
					);

					const result = await rollCommand.executeQuickRoll(interaction, {
						modifier, mode, statKey, statName, charName,
					});
					await interaction.update({ content: null, embeds: result.embeds, components: [], files: result.files });
					return;
				}
			}
			catch (err) {
				console.error('Quick roll error:', err);
				try {
					await interaction.update({ content: `Error: ${err.message}`, embeds: [], components: [], flags: 64 });
				}
				catch {
					// swallow
				}
			}
			return;
		}

		// Playbook button: rhune:playbook:<charId>
		if (interaction.customId.startsWith('rhune:playbook:')) {
			try {
				// Handle back-to-sheet from playbook view
				if (interaction.customId.startsWith('rhune:playbook:back:')) {
					const charId = interaction.customId.slice('rhune:playbook:back:'.length);
					const record = await getCharacterById({ id: charId });
					const embed = await renderCharacterSheetEmbed(record);

					const row = new ActionRowBuilder();
					if (record.playbook && lookupPlaybook(record.playbook)) {
						row.addComponents(
							new ButtonBuilder()
								.setCustomId(`rhune:playbook:${record.id}`)
								.setLabel('Playbook')
								.setStyle(ButtonStyle.Primary),
							new ButtonBuilder()
								.setCustomId(`rhune:move:sheet:${record.id}`)
								.setLabel('Moves')
								.setStyle(ButtonStyle.Secondary),
						);
					}
					else {
						row.addComponents(
							new ButtonBuilder()
								.setCustomId(`rhune:move:sheet:${record.id}`)
								.setLabel('Moves')
								.setStyle(ButtonStyle.Secondary),
						);
					}
					row.addComponents(
						new ButtonBuilder()
							.setCustomId(`rhune:edit:${record.id}`)
							.setLabel('Edit')
							.setStyle(ButtonStyle.Secondary),
					);

					await interaction.update({ embeds: [embed], components: [row], flags: 64 });
					return;
				}

				const charId = interaction.customId.slice('rhune:playbook:'.length);
				const record = await getCharacterById({ id: charId });

				const embed = renderPlaybookEmbed(record, 'overview');
				if (!embed) {
					await replyEphemeral(interaction, 'No playbook info found for this character.');
					return;
				}

				const navRow = buildPlaybookNav(record);
				const backRow = new ActionRowBuilder()
					.addComponents(
						new ButtonBuilder()
							.setCustomId(`rhune:playbook:back:${charId}`)
							.setLabel('‹ Back')
							.setStyle(ButtonStyle.Secondary),
					);

				await interaction.reply({ embeds: [embed], components: [navRow, backRow], ephemeral: true });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// === Move reference from sheet button ===
		if (interaction.customId.startsWith('rhune:move:sheet:')) {
			try {
				const embed = new EmbedBuilder()
					.setTitle('📖 Move Reference')
					.setDescription('Choose a category below to view its moves, then select a specific move to read its details.');

				const rows = categoryNames.map(cat => {
					const catMoves = moves[cat];
					const count = Object.keys(catMoves).length;
					return {
						name: getCategoryLabel(cat),
						value: count + ' move' + (count === 1 ? '' : 's'),
						inline: false,
					};
				});

				embed.addFields(rows);

				const backToCategories = new ActionRowBuilder()
					.addComponents(
						...categoryNames.map(cat =>
							new ButtonBuilder()
								.setCustomId('rhune:move:cat:' + cat)
								.setLabel(getCategoryLabel(cat))
								.setStyle(ButtonStyle.Secondary),
						),
					);

				await interaction.reply({ embeds: [embed], components: [backToCategories], ephemeral: true });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// === Move reference buttons ===
		// rhune:move:cat:<category> — show category overview + move picker
		if (interaction.customId.startsWith('rhune:move:cat:')) {
			try {
				const category = interaction.customId.slice('rhune:move:cat:'.length);
				const catMoves = moves[category];
				if (!catMoves) {
					await replyEphemeral(interaction, 'Invalid category.');
					return;
				}

				const moveNames = Object.keys(catMoves);
				const embed = new EmbedBuilder()
					.setTitle(getCategoryLabel(category))
					.setDescription(`${moveNames.length} move${moveNames.length === 1 ? '' : 's'} — select one from the dropdown below to read its full details.`);

				const pickerRow = buildMovePicker(category);
				const navRow = buildMoveNav();

				await interaction.update({ embeds: [embed], components: [pickerRow, navRow].filter(Boolean), flags: 64 });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}


		// Edit button: rhune:edit:<charId>
		if (interaction.customId.startsWith('rhune:edit:')) {
			try {
				const charId = interaction.customId.slice('rhune:edit:'.length);
				const record = await getCharacterById({ id: charId });

				if (record.guild_id !== interaction.guildId) {
					await replyEphemeral(interaction, 'That character is not from this server.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}

				const { editEmbed, editComponents } = buildEditView(record);

				await interaction.reply({
					embeds: [editEmbed],
					components: editComponents,
					ephemeral: true,
				});
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit HP: rhune:edithp:<charId>:+
		if (interaction.customId.startsWith('rhune:edithp:')) {
			try {
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const delta = parts[3] === '+' ? 1 : -1;

				const record = await getCharacterById({ id: charId });
				const current = typeof record.hp === 'number' ? record.hp : 0;
				const newHp = Math.max(0, Math.min(record.hp_max ?? current, current + delta));

				await updateCharacter({ id: charId, patch: { hp: newHp } });

				// Re-render the edit view
				const updated = await getCharacterById({ id: charId });
				const { editEmbed, editComponents } = buildEditView(updated);
				await interaction.update({ embeds: [editEmbed], components: editComponents, flags: 64 });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit XP: rhune:editxp:<charId>:+
		if (interaction.customId.startsWith('rhune:editxp:')) {
			try {
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const delta = parts[3] === '+' ? 1 : -1;

				const record = await getCharacterById({ id: charId });
				const current = typeof record.xp === 'number' ? record.xp : 0;
				const newXp = Math.max(0, current + delta);

				await updateCharacter({ id: charId, patch: { xp: newXp } });

				const updated = await getCharacterById({ id: charId });
				const { editEmbed, editComponents } = buildEditView(updated);
				await interaction.update({ embeds: [editEmbed], components: editComponents, flags: 64 });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit debility: rhune:editdebil:<charId>:<DebilityName>
		if (interaction.customId.startsWith('rhune:editdebil:')) {
			try {
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const debilName = parts.slice(3).join(':');

				const record = await getCharacterById({ id: charId });
				let debils = Array.isArray(record.debilities)
					? record.debilities.filter(Boolean)
					: [];

				if (debils.includes(debilName)) {
					debils = debils.filter(d => d !== debilName);
				}
				else {
					debils.push(debilName);
				}

				await updateCharacter({ id: charId, patch: { debilities: debils } });

				const updated = await getCharacterById({ id: charId });
				const { editEmbed, editComponents } = buildEditView(updated);
				await interaction.update({ embeds: [editEmbed], components: editComponents, flags: 64 });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit done: rhune:editdone:<charId>
		if (interaction.customId.startsWith('rhune:editdone:')) {
			try {
				const charId = interaction.customId.slice('rhune:editdone:'.length);
				const record = await getCharacterById({ id: charId });
				const embed = await renderCharacterSheetEmbed(record);


				const row = new ActionRowBuilder();
				if (record.playbook && lookupPlaybook(record.playbook)) {
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

				await interaction.update({ embeds: [embed], components: [row], flags: 64 });
			}
			catch (err) {
				handleError(interaction, err);
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
				case 'togglepossession':
					togglePossession(wizardId, value);
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

					const rules = state.playbookData.creationRules;

					// Resolve OR package choices to individual move names
					const orGrantedMoves = [];
					if (rules.orGroups && state.orChoices) {
						for (const [gi, pkgName] of Object.entries(state.orChoices).filter(([, v]) => v)) {
							const group = rules.orGroups[parseInt(gi)];
							if (!group) continue;
							const pkg = group.options.find(o => o.name === pkgName);
							if (pkg && pkg.grants) {
								pkg.grants.forEach(m => orGrantedMoves.push(m));
							}
						}
					}

					const allMoves = [
						...state.grantedMoves,
						...Object.keys(state.playbookData.startingMoves),
						...orGrantedMoves,
						...state.chosenMoves,
					];

					const choices = {
						playbook: state.playbookKey,
						background: state.background,
						instinct: state.instinct,
						chosen_moves: allMoves,
						chosen_possessions: state.chosenPossessions || [],
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

					const components = [];
					const row = new ActionRowBuilder();

					if (record.playbook && lookupPlaybook(record.playbook)) {
						row.addComponents(
							new ButtonBuilder()
								.setCustomId(`rhune:playbook:${record.id}`)
								.setLabel('Playbook')
								.setStyle(ButtonStyle.Primary),
							new ButtonBuilder()
								.setCustomId(`rhune:move:sheet:${record.id}`)
								.setLabel('Moves')
								.setStyle(ButtonStyle.Secondary),
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
						embeds: [new EmbedBuilder().setDescription('Character creation cancelled.')],
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
				handleError(interaction, err);
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
			handleError(interaction, err);
		}
		return;
	}

	// === Playbook section select menus ===
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rhune:playbook:section:')) {
		const charId = interaction.customId.slice('rhune:playbook:section:'.length);
		const section = interaction.values[0];

		try {
			const record = await getCharacterById({ id: charId });


			const embed = renderPlaybookEmbed(record, section);
			if (!embed) {
				await replyEphemeral(interaction, 'No playbook info found for this character.');
				return;
			}

			const navRow = buildPlaybookNav(record);
			const backRow = new ActionRowBuilder()
				.addComponents(
					new ButtonBuilder()
						.setCustomId(`rhune:playbook:back:${charId}`)
						.setLabel('‹ Back')
						.setStyle(ButtonStyle.Secondary),
				);

			await interaction.update({ embeds: [embed], components: [navRow, backRow], flags: 64 });
		}
		catch (err) {
			handleError(interaction, err);
		}
		return;
	}


	// === Move reference select menus ===
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rhune:move:')) {
		try {
			// rhune:move:pickcategory — jump to a category
			if (interaction.customId === 'rhune:move:pickcategory') {
				const category = interaction.values[0];
				const catMoves = moves[category];
				if (!catMoves) {
					await replyEphemeral(interaction, 'Invalid category.');
					return;
				}

				const moveNames = Object.keys(catMoves);
				const embed = new EmbedBuilder()
					.setTitle(getCategoryLabel(category))
					.setDescription(`${moveNames.length} move${moveNames.length === 1 ? '' : 's'} — select one from the dropdown below to read its full details.`);

				const pickerRow = buildMovePicker(category);
				const navRow = buildMoveNav();

				await interaction.update({ embeds: [embed], components: [pickerRow, navRow].filter(Boolean), flags: 64 });
				return;
			}

			// rhune:move:pickmove:<category> — show a specific move
			if (interaction.customId.startsWith('rhune:move:pickmove:')) {
				const category = interaction.customId.slice('rhune:move:pickmove:'.length);
				const moveName = interaction.values[0];
				const moveData = getMove(category, moveName);
				if (!moveData) {
					await replyEphemeral(interaction, 'Move not found.');
					return;
				}

				const embed = new EmbedBuilder()
					.setTitle(`${getCategoryLabel(category)} — ${moveName}`)
					.setDescription(moveData.text.slice(0, 4096));

				const pickerRow = buildMovePicker(category);
				const navRow = buildMoveNav();

				await interaction.update({ embeds: [embed], components: [pickerRow, navRow].filter(Boolean), flags: 64 });
				return;
			}
		}
		catch (err) {
			handleError(interaction, err);
		}
		return;
	}

	// === Creation wizard select menus ===
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rhune:create:')) {
		const wizardId = interaction.user.id;
		const wizard = getWizard(wizardId);
		if (!wizard) {
			await replyEphemeral(interaction, 'No active character creation. Please start with /char create.');
			return;
		}

		try {


			if (interaction.customId === 'rhune:create:selectmove') {
				wizard.chosenMoves = interaction.values;
			}
			else if (interaction.customId.startsWith('rhune:create:orchoice:')) {
				const parts = interaction.customId.split(':');
				const groupIdx = parseInt(parts[3], 10);
				const pkgName = interaction.values[0];
				setOrChoice(wizardId, groupIdx, pkgName);
			}

			const step = getStepInfo(wizardId);
			const result = buildWizardStep(interaction, step);
			await interaction.update({ embeds: result.embeds, components: result.components, flags: 64 });
		}
		catch (err) {
			handleError(interaction, err);
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