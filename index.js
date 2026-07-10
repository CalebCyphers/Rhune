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
		const parsed = parsePickCharCustomId(interaction.customId);
		if (!parsed) return;

		try {
			const pending = getPending(interaction.user.id);
			if (!pending || pending.action !== parsed.action) {
				await interaction.reply({ content: 'That selection has expired. Please re-run the command.', ephemeral: true });
				return;
			}

			const record = await getCharacterById({ id: parsed.charId });
			if (record.guild_id !== interaction.guildId) {
				await interaction.reply({ content: 'That character is not from this server.', ephemeral: true });
				return;
			}
			if (record.owner_user_id !== interaction.user.id) {
				await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
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
				await interaction.update({ content: result.content, components: [] });
				return;
			}
			if (result.type === 'record') {
				const embed = await renderCharacterSheetEmbed(result.record);
				await interaction.update({ content: 'Done.', embeds: [embed], components: [] });
				return;
			}

			await interaction.reply({ content: 'Unknown action.', ephemeral: true });
		}
		catch (err) {
			console.error(err);
			await interaction.reply({ content: `Error: ${err.message}`, ephemeral: true });
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