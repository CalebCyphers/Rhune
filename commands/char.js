const { SlashCommandBuilder } = require('discord.js');

const {
	createCharacter,
	listCharacters,
	getCharacterById,
	setActiveCharacter,
	getActiveCharacterId,
} = require('../lib/characters_pb');

const { renderCharacterSheetEmbed } = require('../lib/character_embed');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('char')
		.setDescription('Character management')
		.addSubcommand(sub => sub
			.setName('create')
			.setDescription('Create a character (and optionally set active)')
			.addStringOption(opt => opt.setName('name').setDescription('Character name').setRequired(true))
			.addStringOption(opt => opt.setName('playbook').setDescription('Playbook (optional)').setRequired(false))
			.addBooleanOption(opt => opt.setName('set_active').setDescription('Set as your active character in this server').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('list')
			.setDescription('List your characters in this server')
			.addBooleanOption(opt => opt.setName('all').setDescription('List all characters in the server (admin/debug)').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('active')
			.setDescription('Set your active character by id')
			.addStringOption(opt => opt.setName('id').setDescription('Character record id').setRequired(true)))
		.addSubcommand(sub => sub
			.setName('sheet')
			.setDescription('Show a character sheet (by id, or your active character)')
			.addStringOption(opt => opt.setName('id').setDescription('Character record id').setRequired(false))),

	async execute(interaction) {
		const sub = interaction.options.getSubcommand();

		try {
			if (!interaction.guildId) {
				await interaction.reply({ content: 'This command only works inside a server.', ephemeral: true });
				return;
			}

			if (sub === 'create') {
				const name = interaction.options.getString('name');
				const playbook = interaction.options.getString('playbook');
				const setActive = interaction.options.getBoolean('set_active') || false;

				const record = await createCharacter({
					guildId: interaction.guildId,
					ownerUserId: interaction.user.id,
					name,
					playbook,
					stats: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
					hp: null,
					hpMax: null,
					xp: 0,
					loadCurrent: 0,
					loadMax: 0,
				});

				if (setActive) {
					await setActiveCharacter({ guildId: interaction.guildId, userId: interaction.user.id, characterId: record.id });
				}

				const embed = await renderCharacterSheetEmbed(record);
				await interaction.reply({ embeds: [embed], ephemeral: true });
				return;
			}

			if (sub === 'list') {
				const all = interaction.options.getBoolean('all') || false;
				const chars = await listCharacters({
					guildId: interaction.guildId,
					ownerUserId: all ? null : interaction.user.id,
				});

				if (!chars.length) {
					await interaction.reply({ content: all ? 'No characters found in this server yet.' : 'You have no characters in this server yet.', ephemeral: true });
					return;
				}

				const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
				const lines = chars.map(c => {
					const activeMark = c.id === activeId ? ' (active)' : '';
					const playbookText = c.playbook ? ` (${c.playbook})` : '';
					return `• **${c.name}**${playbookText} — \`${c.id}\`${activeMark}`;
				});

				await interaction.reply({ content: lines.join('\n'), ephemeral: true });
				return;
			}

			if (sub === 'active') {
				const id = interaction.options.getString('id');
				const record = await getCharacterById({ id });
				if (record.guild_id !== interaction.guildId) {
					await interaction.reply({ content: 'That character id is not from this server.', ephemeral: true });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				await setActiveCharacter({ guildId: interaction.guildId, userId: interaction.user.id, characterId: id });
				await interaction.reply({ content: 'Set active character to **' + record.name + '** (`' + record.id + '`)' + '.', ephemeral: true });
				return;
			}

			if (sub === 'sheet') {
				const id = interaction.options.getString('id');
				let record;
				if (id) {
					record = await getCharacterById({ id });
				}
				else {
					const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
					if (!activeId) {
						await interaction.reply({ content: 'No active character set. Use `/char active id:<id>` or pass an id to `/char sheet`.', ephemeral: true });
						return;
					}
					record = await getCharacterById({ id: activeId });
				}

				if (record.guild_id !== interaction.guildId) {
					await interaction.reply({ content: 'That character is not from this server.', ephemeral: true });
					return;
				}

				// For now, allow owner-only sheet (bot-private model; can loosen later).
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				const embed = await renderCharacterSheetEmbed(record);
				await interaction.reply({ embeds: [embed], ephemeral: true });
				return;
			}

			await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
		}
		catch (err) {
			// PocketBase client throws errors with status/data that are useful for debugging.
			const status = err?.status ? ` (status ${err.status})` : '';
			const detail = err?.data ? `\n${JSON.stringify(err.data)}` : '';
			await interaction.reply({ content: `Error${status}: ${err.message}${detail}`, ephemeral: true });
		}
	},
};
