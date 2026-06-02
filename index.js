require('dotenv').config();

const { REST, Routes } = require('discord.js')
const fs = require('fs');
const path = require('path');

const deployCommands = async () => {
    try {
        const allCommands = [];

        const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(`./commands/${file}`);
            if ("data" in command && "execute" in command) {
                allCommands.push(command.data.toJSON())
            } else {
                console.log(`WARNING: The command at ${file} is missing a required 'data' or 'execute' property.`, command.hasOwnProperty("data"), command.hasOwnProperty("execute"));
            }
        }

        const rest = new REST().setToken(process.env.BOT_TOKEN)

        console.log(`Started refreshing ${allCommands.length} application slash commands globally`)

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: allCommands},
        );

        console.log('Successfully reloaded all commands!')
    } catch (error) {
        console.error('Error deploying commands:', error)
    }
}

const {
    Client,
    GatewayIntentBits,
    Partials,
    Collection,
    ActivityType,
    PresenceUpdateStatus,
    Events
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,  
        GatewayIntentBits.GuildMembers   
    ],
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember
    ]
});

client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file)
    const command = require(filePath);

    if('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    } else {
        console.log(`The Command ${filePath} is missing a required "data" or "execute" property.`)
    }
}

client.once(Events.ClientReady, async () => {
    console.log(`Ready! Logged in as ${client.user.tag}`)

    // Deploy Commands
    await deployCommands();
    console.log(`Commands deployed globally`)

    const statusType = process.env.BOT_STATUS

    const statusMap = {
        "online": PresenceUpdateStatus.Online,
        "idle": PresenceUpdateStatus.Idle,
        "dnd": PresenceUpdateStatus.DoNotDisturb,
        "invisible": PresenceUpdateStatus.Invisible
    }

    client.user.setPresence({
        status: statusMap[statusType]
    })

    console.log(`Bot status set to ${statusType}`)
} )

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`)
        return
    }
    

    try {
        await command.execute(interaction)
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({content: "There was an error while executing this command.", ephemeral:true});
        } else {
            await interaction.reply({content: "There was an error while executing this command.", ephemeral:true});
        }
    }
});

client.login(process.env.BOT_TOKEN)