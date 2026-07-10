const { SlashCommandBuilder } = require('discord.js');

const {
	createCharacter,
	listCharacters,
	getCharacterById,
	setActiveCharacter,
	getActiveCharacterId,
	updateCharacter,
} = require('../lib/characters_pb');

const { renderCharacterSheetEmbed } = require('../lib/character_embed');
const { addCondition, removeCondition } = require('../lib/conditions_pb');

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
			.addStringOption(opt => opt.setName('id').setDescription('Character record id').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('set')
			.setDescription('Set absolute character values (owner only)')
			.addStringOption(opt => opt.setName('id').setDescription('Character record id (defaults to active)').setRequired(false))
			.addIntegerOption(opt => opt.setName('str').setDescription('STR').setRequired(false))
			.addIntegerOption(opt => opt.setName('dex').setDescription('DEX').setRequired(false))
			.addIntegerOption(opt => opt.setName('con').setDescription('CON').setRequired(false))
			.addIntegerOption(opt => opt.setName('int').setDescription('INT').setRequired(false))
			.addIntegerOption(opt => opt.setName('wis').setDescription('WIS').setRequired(false))
			.addIntegerOption(opt => opt.setName('cha').setDescription('CHA').setRequired(false))
			.addIntegerOption(opt => opt.setName('hp').setDescription('HP').setRequired(false))
			.addIntegerOption(opt => opt.setName('hp_max').setDescription('HP max').setRequired(false))
			.addIntegerOption(opt => opt.setName('xp').setDescription('XP').setRequired(false))
			.addIntegerOption(opt => opt.setName('load_current').setDescription('Current load (manual)').setRequired(false))
			.addIntegerOption(opt => opt.setName('load_max').setDescription('Max load (manual)').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('mod')
			.setDescription('Modify character values by deltas (owner only)')
			.addStringOption(opt => opt.setName('id').setDescription('Character record id (defaults to active)').setRequired(false))
			.addIntegerOption(opt => opt.setName('hp').setDescription('HP delta (+/-)').setRequired(false))
			.addIntegerOption(opt => opt.setName('hp_max').setDescription('HP max delta (+/-)').setRequired(false))
			.addIntegerOption(opt => opt.setName('xp').setDescription('XP delta (+/-)').setRequired(false))
			.addIntegerOption(opt => opt.setName('load_current').setDescription('Load current delta (+/-)').setRequired(false))
			.addIntegerOption(opt => opt.setName('load_max').setDescription('Load max delta (+/-)').setRequired(false)))
		.addSubcommandGroup(group => group
			.setName('condition')
			.setDescription('Manage character conditions')
			.addSubcommand(sub => sub
				.setName('add')
				.setDescription('Add a condition')
				.addStringOption(opt => opt.setName('id').setDescription('Character record id (defaults to active)').setRequired(false))
				.addStringOption(opt => opt.setName('name').setDescription('Condition name').setRequired(true)))
			.addSubcommand(sub => sub
				.setName('remove')
				.setDescription('Remove a condition')
				.addStringOption(opt => opt.setName('id').setDescription('Character record id (defaults to active)').setRequired(false))
				.addStringOption(opt => opt.setName('name').setDescription('Condition name').setRequired(true)))),

	async execute(interaction) {
		const group = interaction.options.getSubcommandGroup(false);
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

			async function resolveCharRecord() {
				const idOpt = interaction.options.getString('id');
				if (idOpt) return getCharacterById({ id: idOpt });
				const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
				if (!activeId) return null;
				return getCharacterById({ id: activeId });
			}

			if (sub === 'sheet') {
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active id:<id>` or pass an id to `/char sheet`.', ephemeral: true });
					return;
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

			if (sub === 'set') {
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active id:<id>` or pass an id to `/char set`.', ephemeral: true });
					return;
				}
				if (record.guild_id !== interaction.guildId) {
					await interaction.reply({ content: 'That character is not from this server.', ephemeral: true });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				const patch = {};
				const stats = { ...(record.stats || {}) };
				for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
					const val = interaction.options.getInteger(key);
					if (val !== null) stats[key] = val;
				}
				patch.stats = stats;

				const hp = interaction.options.getInteger('hp');
				const hpMax = interaction.options.getInteger('hp_max');
				const xp = interaction.options.getInteger('xp');
				const loadCurrent = interaction.options.getInteger('load_current');
				const loadMax = interaction.options.getInteger('load_max');

				if (hp !== null) patch.hp = hp;
				if (hpMax !== null) patch.hp_max = hpMax;
				if (xp !== null) patch.xp = xp;
				if (loadCurrent !== null) patch.load_current = loadCurrent;
				if (loadMax !== null) patch.load_max = loadMax;

				const updated = await updateCharacter({ id: record.id, patch });
				const embed = await renderCharacterSheetEmbed(updated);
				await interaction.reply({ content: 'Updated character.', embeds: [embed], ephemeral: true });
				return;
			}

			if (sub === 'mod') {
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active id:<id>` or pass an id to `/char mod`.', ephemeral: true });
					return;
				}
				if (record.guild_id !== interaction.guildId) {
					await interaction.reply({ content: 'That character is not from this server.', ephemeral: true });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				const patch = {};
				for (const field of ['hp', 'hp_max', 'xp', 'load_current', 'load_max']) {
					const delta = interaction.options.getInteger(field);
					if (delta === null) continue;
					const current = Number(record[field] ?? 0);
					patch[field] = current + delta;
				}

				const updated = await updateCharacter({ id: record.id, patch });
				const embed = await renderCharacterSheetEmbed(updated);
				await interaction.reply({ content: 'Modified character.', embeds: [embed], ephemeral: true });
				return;
			}

			if (group === 'condition' && sub === 'add') {
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active id:<id>` or pass an id to `/char condition add`.', ephemeral: true });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}
				const name = interaction.options.getString('name');
				await addCondition({ characterId: record.id, name });
				const updated = await getCharacterById({ id: record.id });
				const embed = await renderCharacterSheetEmbed(updated);
				await interaction.reply({ content: `Added condition: **${name}**`, embeds: [embed], ephemeral: true });
				return;
			}

			if (group === 'condition' && sub === 'remove') {
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active id:<id>` or pass an id to `/char condition remove`.', ephemeral: true });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}
				const name = interaction.options.getString('name');
				const res = await removeCondition({ characterId: record.id, name });
				const updated = await getCharacterById({ id: record.id });
				const embed = await renderCharacterSheetEmbed(updated);
				await interaction.reply({ content: `Removed condition: **${name}** (removed ${res.deleted})`, embeds: [embed], ephemeral: true });
				return;
			}

			await interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
		}
		catch (err) {
			// PocketBase client throws errors with status/data that are useful for debugging.
			const status = err?.status ? ` (status ${err.status})` : '';
			const detail = err?.data ? `\n${JSON.stringify(err.data)}` : '';
			const url = err?.url ? `\nurl: ${err.url}` : '';
			await interaction.reply({ content: `Error${status}: ${err.message}${detail}${url}`, ephemeral: true });
		}
	},
};
