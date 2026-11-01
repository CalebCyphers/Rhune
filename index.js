require('dotenv').config();

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

// --- Crash guards -----------------------------------------------------------
// A single unhandled error (e.g. DiscordAPIError 10062 "Unknown interaction"
// from a late reply) would otherwise emit an 'error' event on the Client, and
// an unhandled 'error' event takes down the whole process. That turned one slow
// interaction into a ~30s outage during which EVERY interaction failed. We log
// loudly instead of exiting.
process.on('unhandledRejection', (reason) => {
	console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
	console.error('[uncaughtException]', err);
});

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
const { getNotesText, upsertNotes, deleteNotes } = require('./lib/notes_state_pb');
const { removeAllConditions } = require('./lib/conditions_pb');
const { buildNotesView, buildNotesModal, NOTES_MODAL_INPUT_ID, NOTES_INPUT_LIMIT } = require('./lib/notes_view');
const { getCharacterById } = require('./lib/characters_pb');
const { renderCharacterSheetEmbed } = require('./lib/character_embed');
const { buildSheetButtons } = require('./lib/sheet_buttons');
const { TRAIT_BY_NAME } = require('./lib/traits_data');
const { getWizard, clearWizard, selectPlaybook, selectBackground, selectInstinct, setTraitPage, setTraitSlot, clearTrait, toggleMove, setOrChoice, togglePossession, getStepInfo, advanceStep, backStep } = require('./lib/create_wizard');
const { createCharacter, setActiveCharacter, updateCharacter, getActiveCharacterId, deleteCharacter } = require('./lib/characters_pb');
const { replyEphemeral, updateClearComponents, handleError, deferComponentUpdate, deferEphemeralReply } = require('./lib/interaction_helpers');
const { lookupPlaybook, renderCharacterMoves } = require('./lib/playbooks');
const { buildWizardStep } = require('./commands/char');
const { doCharAction } = require('./lib/char_ops');
const { isGuildOwner } = require('./lib/gm');
const { moves } = require('./lib/moves_data');
const { buildMoveReferenceRoot, buildMoveCategoryView } = require('./lib/move_views');
const editOps = require('./lib/edit_ops');
const editViews = require('./lib/edit_views');

const { pbDiagnostics } = require('./lib/pb_diagnostics');

// Import quick-roll helper from the roll command
const rollCommand = require('./commands/roll');

/**
 * Build the Edit view embed and components for a character.
 * (Builders moved to lib/edit_views.js; this wrapper keeps the old call sites.)
 */
function buildEditView(record) {
	return editViews.buildEditView(record);
}

/**
 * Fetch a character for an edit interaction and enforce ownership.
 * Replies with the error and returns null when the edit should not proceed.
 */
async function loadOwnedCharacter(interaction, charId) {
	const record = await getCharacterById({ id: charId, guildId: interaction.guildId });
	if (!record) {
		await replyEphemeral(interaction, 'That character is not from this server.');
		return null;
	}
	if (record.owner_user_id !== interaction.user.id) {
		await replyEphemeral(interaction, 'You do not own that character.');
		return null;
	}
	return record;
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

// Never let a stray Client 'error' event crash the process (see crash guards
// at the top of the file). Log and keep serving.
client.on(Events.Error, err => {
	console.error('[client error]', err);
});

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

// (The old /outfit reply-to-save message handler is retired — notes are now
// edited through a modal from the sheet's Notes button or /notes.)

client.on(Events.InteractionCreate, async interaction => {
	// === Notes edit modal: rhune:notes:edit:<charId> ===
	if (interaction.isModalSubmit() && interaction.customId.startsWith('rhune:notes:edit:')) {
		try {
			await deferEphemeralReply(interaction);
			const charId = interaction.customId.slice('rhune:notes:edit:'.length);
			const record = await getCharacterById({ id: charId });

			if (!record || record.guild_id !== interaction.guildId) {
				await replyEphemeral(interaction, 'That character is not from this server.');
				return;
			}
			if (record.owner_user_id !== interaction.user.id) {
				await replyEphemeral(interaction, 'You do not own that character.');
				return;
			}

			const text = String(interaction.fields.getTextInputValue(NOTES_MODAL_INPUT_ID) ?? '').trim();
			if (text.length > NOTES_INPUT_LIMIT) {
				await replyEphemeral(interaction, `That's too long (${text.length} characters). Please keep notes under ${NOTES_INPUT_LIMIT} characters.`);
				return;
			}

			await upsertNotes({
				characterId: record.id,
				guildId: interaction.guildId,
				text,
				updatedByUserId: interaction.user.id,
			});

			const { embeds, components } = buildNotesView(record, text);
			await interaction.editReply({ embeds, components });
		}
		catch (err) {
			handleError(interaction, err);
		}
		return;
	}

	// === Custom-trait edit modal: rhune:edittraitmodal:<charId> ===
	if (interaction.isModalSubmit() && interaction.customId.startsWith('rhune:edittraitmodal:')) {
		try {
			await deferEphemeralReply(interaction);
			const charId = interaction.customId.slice('rhune:edittraitmodal:'.length);
			const record = await loadOwnedCharacter(interaction, charId);
			if (!record) return;

			const name = interaction.fields.getTextInputValue(editViews.CUSTOM_TRAIT_MODAL_NAME_ID);
			const text = interaction.fields.getTextInputValue(editViews.CUSTOM_TRAIT_MODAL_TEXT_ID);
			const result = editOps.addCustomTrait(record, name, text);
			if (result.error) {
				await interaction.editReply({ content: result.error });
				return;
			}

			// updateCharacter returns the updated record — no re-fetch needed.
			const updated = await updateCharacter({ id: charId, patch: result.patch });
			const view = editViews.buildTraitsEditView(updated, 0);
			await interaction.editReply({ ...view, content: result.message });
		}
		catch (err) {
			handleError(interaction, err);
		}
		return;
	}

	if (interaction.isButton()) {
		// === Roll builder buttons: rhune:rb:* ===
		if (interaction.customId.startsWith('rhune:rb:')) {
			try {
				const parts = interaction.customId.split(':');
				const action = parts[2];

				// Cancel — dismiss the builder.
				if (action === 'cancel') {
					await interaction.update({ content: 'Cancelled.', embeds: [], components: [], flags: 64 });
					return;
				}

				// Inert read-out button (the current NdX label).
				if (action === 'noop') {
					return;
				}

				// Roll it.
				if (action === 'roll') {
					const state = rollCommand.decodeBuilder(parts[3]);
					await rollCommand.executeBuilderRoll(interaction, state);
					return;
				}

				// Die type / count / mode — re-render the builder (stateless).
				if (action === 'die' || action === 'count' || action === 'mode') {
					const state = rollCommand.decodeBuilder(parts[3]);
					const { embed, components } = rollCommand.buildRollBuilder(state);
					await interaction.update({ embeds: [embed], components, flags: 64 });
					return;
				}
			}
			catch (err) {
				console.error('Roll builder error:', err);
				try {
					await interaction.update({ content: `Error: ${err.message}`, embeds: [], components: [], flags: 64 });
				}
				catch {
					// swallow
				}
			}
			return;
		}

		// === Reroll buttons: rhune:rr:* ===
		if (interaction.customId.startsWith('rhune:rr:')) {
			try {
				const parts = interaction.customId.split(':');
				const kind = parts[2];

				if (kind === 'ones') {
					// Reroll every die showing a 1 (the bust reroll).
					const kept = rollCommand.decodeRolls(parts[3]);
					const newKept = rollCommand.rerollOnes(kept);
					await rollCommand.executePoolRoll(interaction, { keptRolls: newKept });
					return;
				}
			}
			catch (err) {
				console.error('Reroll error:', err);
				try {
					await interaction.update({ content: `Error: ${err.message}`, embeds: [], components: [], flags: 64 });
				}
				catch {
					// swallow
				}
			}
			return;
		}

		// (Playbook view retired — damage/background/instinct/moves now render on
		// the character sheet itself, each linked to its full text.)

		// === Moves from sheet button ===
		if (interaction.customId.startsWith('rhune:move:sheet:')) {
			try {
				await deferEphemeralReply(interaction);
				const charId = interaction.customId.slice('rhune:move:sheet:'.length);
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;

				const browseRow = new ActionRowBuilder().addComponents(
					new ButtonBuilder()
						.setCustomId('rhune:move:reference')
						.setLabel('📖 Browse All Moves')
						.setStyle(ButtonStyle.Secondary),
				);

				// Character's own playbook moves, each linked to the rules site.
				if (record.playbook && lookupPlaybook(record.playbook)) {
					const embeds = renderCharacterMoves(record);
					if (embeds) {
						await interaction.editReply({ embeds, components: [browseRow] });
						return;
					}
				}

				// Fallback: no playbook — show the full move reference root.
				const view = buildMoveReferenceRoot();
				await interaction.editReply({ embeds: view.embeds, components: view.components });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// === Browse full move reference button ===
		if (interaction.customId === 'rhune:move:reference') {
			try {
				const view = buildMoveReferenceRoot();
				await interaction.update({ embeds: view.embeds, components: view.components, flags: 64 });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// === Move reference buttons ===
		// rhune:move:cat:<category> — list the category's moves as site links
		if (interaction.customId.startsWith('rhune:move:cat:')) {
			try {
				const category = interaction.customId.slice('rhune:move:cat:'.length);
				if (!moves[category]) {
					await replyEphemeral(interaction, 'Invalid category.');
					return;
				}

				const view = buildMoveCategoryView(category);
				await interaction.update({ embeds: view.embeds, components: view.components, flags: 64 });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}


		// Notes button: rhune:notes:<charId> — show freeform notes.
		if (interaction.customId.startsWith('rhune:notes:')) {
			try {
				await deferEphemeralReply(interaction);
				const charId = interaction.customId.slice('rhune:notes:'.length);
				const record = await getCharacterById({ id: charId });

				if (record.guild_id !== interaction.guildId) {
					await replyEphemeral(interaction, 'That character is not from this server.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}

				const text = await getNotesText({ characterId: record.id, guildId: interaction.guildId });
				const { embeds, components } = buildNotesView(record, text);
				await interaction.editReply({ embeds, components });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit-notes button: rhune:notesedit:<charId> — open the notes modal.
		// NOTE: a modal must be the FIRST response, so we cannot defer here. Keep
		// the pre-modal work to a single parallel fetch to stay under 3s.
		if (interaction.customId.startsWith('rhune:notesedit:')) {
			try {
				const charId = interaction.customId.slice('rhune:notesedit:'.length);
				const [record, text] = await Promise.all([
					getCharacterById({ id: charId }),
					getNotesText({ characterId: charId, guildId: interaction.guildId }),
				]);

				if (record.guild_id !== interaction.guildId) {
					await replyEphemeral(interaction, 'That character is not from this server.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}

				await interaction.showModal(buildNotesModal(record.id, text));
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit button: rhune:edit:<charId>
		if (interaction.customId.startsWith('rhune:edit:')) {
			try {
				await deferEphemeralReply(interaction);
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

				await interaction.editReply({
					embeds: [editEmbed],
					components: editComponents,
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
				await deferComponentUpdate(interaction);
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const delta = parts[3] === '+' ? 1 : -1;

				const record = await getCharacterById({ id: charId, guildId: interaction.guildId });
				if (!record) {
					await replyEphemeral(interaction, 'That character is not from this server.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}
				const current = typeof record.hp === 'number' ? record.hp : 0;
				const newHp = Math.max(0, Math.min(record.hp_max ?? current, current + delta));

				// updateCharacter returns the updated record — no re-fetch needed.
				const updated = await updateCharacter({ id: charId, patch: { hp: newHp } });
				const { editEmbed, editComponents } = buildEditView(updated);
				await interaction.editReply({ embeds: [editEmbed], components: editComponents });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit XP: rhune:editxp:<charId>:+
		if (interaction.customId.startsWith('rhune:editxp:')) {
			try {
				await deferComponentUpdate(interaction);
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const delta = parts[3] === '+' ? 1 : -1;

				const record = await getCharacterById({ id: charId, guildId: interaction.guildId });
				if (!record) {
					await replyEphemeral(interaction, 'That character is not from this server.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}
				const current = typeof record.xp === 'number' ? record.xp : 0;
				const newXp = Math.max(0, current + delta);

				// updateCharacter returns the updated record — no re-fetch needed.
				const updated = await updateCharacter({ id: charId, patch: { xp: newXp } });
				const { editEmbed, editComponents } = buildEditView(updated);
				await interaction.editReply({ embeds: [editEmbed], components: editComponents });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit debility: rhune:editdebil:<charId>:<DebilityName>
		if (interaction.customId.startsWith('rhune:editdebil:')) {
			try {
				await deferComponentUpdate(interaction);
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const debilName = parts.slice(3).join(':');

				const record = await getCharacterById({ id: charId, guildId: interaction.guildId });
				if (!record) {
					await replyEphemeral(interaction, 'That character is not from this server.');
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await replyEphemeral(interaction, 'You do not own that character.');
					return;
				}
				let debils = Array.isArray(record.debilities)
					? record.debilities.filter(Boolean)
					: [];

				if (debils.includes(debilName)) {
					debils = debils.filter(d => d !== debilName);
				}
				else {
					debils.push(debilName);
				}

				// updateCharacter returns the updated record — no re-fetch needed.
				const updated = await updateCharacter({ id: charId, patch: { debilities: debils } });
				const { editEmbed, editComponents } = buildEditView(updated);
				await interaction.editReply({ embeds: [editEmbed], components: editComponents });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit max HP: rhune:editmaxhp:<charId>:+
		if (interaction.customId.startsWith('rhune:editmaxhp:')) {
			try {
				await deferComponentUpdate(interaction);
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const delta = parts[3] === '+' ? 1 : -1;

				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;

				const result = editOps.adjustMaxHp(record, delta);
				if (result.error) {
					await interaction.followUp({ content: result.error, ephemeral: true });
					return;
				}

				// updateCharacter returns the updated record — no re-fetch needed.
				const updated = await updateCharacter({ id: charId, patch: result.patch });
				const { editEmbed, editComponents } = buildEditView(updated);
				await interaction.editReply({ embeds: [editEmbed], components: editComponents });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Traits sub-view: rhune:edittraits:<charId>
		if (interaction.customId.startsWith('rhune:edittraits:')) {
			try {
				await deferComponentUpdate(interaction);
				const charId = interaction.customId.slice('rhune:edittraits:'.length);
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;
				await interaction.editReply(editViews.buildTraitsEditView(record, 0));
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Moves sub-view: rhune:editmoves:<charId>
		if (interaction.customId.startsWith('rhune:editmoves:')) {
			try {
				await deferComponentUpdate(interaction);
				const charId = interaction.customId.slice('rhune:editmoves:'.length);
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;
				await interaction.editReply(editViews.buildMovesEditView(record, 0));
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Back to main edit view: rhune:editback:<charId>
		if (interaction.customId.startsWith('rhune:editback:')) {
			try {
				await deferComponentUpdate(interaction);
				const charId = interaction.customId.slice('rhune:editback:'.length);
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;
				const { editEmbed, editComponents } = buildEditView(record);
				await interaction.editReply({ embeds: [editEmbed], components: editComponents });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Trait add paging: rhune:edittraitpage:<charId>:<page>
		if (interaction.customId.startsWith('rhune:edittraitpage:')) {
			try {
				await deferComponentUpdate(interaction);
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const page = parseInt(parts[3], 10) || 0;
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;
				await interaction.editReply(editViews.buildTraitsEditView(record, page));
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Move add paging: rhune:editmovepage:<charId>:<page>
		if (interaction.customId.startsWith('rhune:editmovepage:')) {
			try {
				await deferComponentUpdate(interaction);
				const parts = interaction.customId.split(':');
				const charId = parts[2];
				const page = parseInt(parts[3], 10) || 0;
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;
				await interaction.editReply(editViews.buildMovesEditView(record, page));
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Custom trait modal: rhune:edittraitcustom:<charId>
		// NOTE: a modal must be the FIRST response, so we cannot defer here.
		if (interaction.customId.startsWith('rhune:edittraitcustom:')) {
			try {
				const charId = interaction.customId.slice('rhune:edittraitcustom:'.length);
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;
				await interaction.showModal(editViews.buildCustomTraitModal(record.id));
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Confirm character deletion: rhune:confirmdelete:<charId>
		if (interaction.customId.startsWith('rhune:confirmdelete:')) {
			try {
				await deferComponentUpdate(interaction);
				const charId = interaction.customId.slice('rhune:confirmdelete:'.length);
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;

				// Cascade: the character's notes + conditions go with them (roll
				// logs are keyed by user, not character, so they're unaffected).
				// Clear the active mapping first if this was the active character.
				const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
				if (activeId === record.id) {
					await setActiveCharacter({ guildId: interaction.guildId, userId: interaction.user.id, characterId: null });
				}
				await Promise.all([
					deleteNotes({ characterId: record.id }),
					removeAllConditions({ characterId: record.id }),
				]);
				await deleteCharacter({ id: record.id });

				await interaction.editReply({ content: `Deleted character **${record.name}**.`, embeds: [], components: [] });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Cancel character deletion: rhune:canceldelete:<charId>
		if (interaction.customId.startsWith('rhune:canceldelete:')) {
			try {
				await interaction.update({ content: 'Deletion cancelled — nothing was deleted.', embeds: [], components: [] });
			}
			catch (err) {
				handleError(interaction, err);
			}
			return;
		}

		// Edit done: rhune:editdone:<charId>
		if (interaction.customId.startsWith('rhune:editdone:')) {
			try {
				await deferComponentUpdate(interaction);
				const charId = interaction.customId.slice('rhune:editdone:'.length);
				const record = await loadOwnedCharacter(interaction, charId);
				if (!record) return;
				const embed = await renderCharacterSheetEmbed(record);
				const row = buildSheetButtons(record);

				await interaction.editReply({ embeds: [embed], components: [row] });
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
				case 'traitpage':
					setTraitPage(wizardId, value);
					break;
				case 'toggletrait':
					setTraitSlot(wizardId, 0, value);
					break;
				case 'cleartrait':
					clearTrait(wizardId, value);
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
					await interaction.deferUpdate();
					const state = getWizard(wizardId);
					if (!state) {
						await interaction.editReply({ embeds: [new EmbedBuilder().setDescription('Session expired. Please start again with /char create.')], components: [], flags: 64 });
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
						traits: (state.chosenTraits || []).map(name => {
							const t = TRAIT_BY_NAME[name];
							return { name, text: t ? t.text : '', improved: false, superior: false };
						}),
						chosen_moves: allMoves,
						chosen_possessions: state.chosenPossessions || [],
					};

					const maxHp = state.playbookData.creationRules?.maxHP || 20;

					const record = await createCharacter({
						guildId: state.guildId,
						ownerUserId: state.userId,
						name: state.name,
						playbook: state.playbookKey,
						hp: maxHp,
						hpMax: maxHp,
						xp: 0,
						loadCurrent: 0,
						loadMax: 0,
						choices,
					});

					await setActiveCharacter({ guildId: state.guildId, userId: state.userId, characterId: record.id });

					const embed = await renderCharacterSheetEmbed(record);

					// Sheet action buttons (shared builder; includes the Rules ↗ link).
					const components = [buildSheetButtons(record)];

					await interaction.editReply({ embeds: [embed], components, flags: 64 });
					clearWizard(wizardId);
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
			// Ack within Discord's 3s window before the PocketBase work below.
			await deferComponentUpdate(interaction);
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
			const isGm = await isGuildOwner(interaction, interaction.user.id);
			if (record.owner_user_id !== interaction.user.id && !isGm) {
				await replyEphemeral(interaction, 'You do not own that character.');
				return;
			}


			const result = await doCharAction({
				action: pending.action,
				guildId: interaction.guildId,
				userId: interaction.user.id,
				charId: record.id,
				payload: pending.payload,
				guildOwnerId: interaction.guild?.ownerId ?? null,
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

			await replyEphemeral(interaction, 'Unknown action.');
		}
		catch (err) {
			handleError(interaction, err);
		}
		return;
	}

	// (Playbook section select retired — the playbook view no longer exists.)


	// (Move detail view retired — move names now link straight to the rules site.)

	// === Edit view select menus ===
	if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rhune:edit')) {
		try {
			await deferComponentUpdate(interaction);
			const parts = interaction.customId.split(':');
			const kind = parts[1];
			const charId = parts[2];
			const page = parts[3] !== undefined ? (parseInt(parts[3], 10) || 0) : 0;

			const record = await loadOwnedCharacter(interaction, charId);
			if (!record) return;

			const value = interaction.values[0];
			let result;
			if (kind === 'edittraitadd') result = editOps.addTrait(record, value);
			else if (kind === 'edittraitdel') result = editOps.removeTrait(record, value);
			else if (kind === 'editmoveadd') result = editOps.addMove(record, value);
			else if (kind === 'editmovedel') result = editOps.removeMove(record, value);
			else return;

			let updated;
			if (result.error) {
				await interaction.followUp({ content: result.error, ephemeral: true });
				updated = await getCharacterById({ id: charId });
			}
			else {
				// updateCharacter returns the updated record — no re-fetch needed.
				updated = await updateCharacter({ id: charId, patch: result.patch });
			}

			const view = (kind === 'edittraitadd' || kind === 'edittraitdel')
				? editViews.buildTraitsEditView(updated, page)
				: editViews.buildMovesEditView(updated, page);
			await interaction.editReply(view);
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
			else if (interaction.customId.startsWith('rhune:create:picktrait:')) {
				const slot = interaction.customId.split(':')[3];
				setTraitSlot(wizardId, slot, interaction.values[0]);
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

// Tiny health HTTP server for Fly.io
const http = require('http');
const healthPort = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
	if (req.url === '/health') {
		res.writeHead(200, { 'Content-Type': 'text/plain' });
		res.end('ok');
		return;
	}
	res.writeHead(200, { 'Content-Type': 'text/plain' });
	res.end('Rhune bot running');
});
server.listen(healthPort, '0.0.0.0', () => {
	console.log(`Health server listening on 0.0.0.0:${healthPort}`);
});