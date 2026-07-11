const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

const {
	listCharacters,
	getCharacterById,
	setActiveCharacter,
	getActiveCharacterId,
	updateCharacter,
	renameCharacter,
	deleteCharacter,
} = require('../lib/characters_pb');

const { renderCharacterSheetEmbed } = require('../lib/character_embed');
const { lookupPlaybook } = require('../lib/playbooks');
const { startWizard, getStepInfo, selectPlaybook } = require('../lib/create_wizard');
const { addCondition, removeCondition } = require('../lib/conditions_pb');
const { resolveCharacterTarget } = require('../lib/resolve_target');
const { disambiguationMessage } = require('../lib/disambiguation');
const { setPending } = require('../lib/pending_actions');

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
			.setName('rename')
			.setDescription('Rename one of your characters')
			.addStringOption(opt => opt.setName('new_name').setDescription('New character name').setRequired(true))
			.addStringOption(opt => opt.setName('target').setDescription('Character name or record id (defaults to active)').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('delete')
			.setDescription('Delete one of your characters')
			.addStringOption(opt => opt.setName('target').setDescription('Character name or record id (defaults to active)').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('active')
			.setDescription('Set your active character by name or id')
			.addStringOption(opt => opt.setName('target').setDescription('Character name or record id').setRequired(true)))
		.addSubcommand(sub => sub
			.setName('sheet')
			.setDescription('Show a character sheet (by name/id, or your active character)')
			.addStringOption(opt => opt.setName('target').setDescription('Character name or record id').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('set')
			.setDescription('Set absolute character values (owner only)')
			.addStringOption(opt => opt.setName('target').setDescription('Character name or record id (defaults to active)').setRequired(false))
			.addIntegerOption(opt => opt.setName('hp').setDescription('HP').setRequired(false))
			.addIntegerOption(opt => opt.setName('hp_max').setDescription('HP max').setRequired(false))
			.addIntegerOption(opt => opt.setName('xp').setDescription('XP').setRequired(false))
			.addIntegerOption(opt => opt.setName('load_current').setDescription('Current load (manual)').setRequired(false))
			.addIntegerOption(opt => opt.setName('load_max').setDescription('Max load (manual)').setRequired(false))
			.addIntegerOption(opt => opt.setName('str').setDescription('STR').setRequired(false))
			.addIntegerOption(opt => opt.setName('dex').setDescription('DEX').setRequired(false))
			.addIntegerOption(opt => opt.setName('con').setDescription('CON').setRequired(false))
			.addIntegerOption(opt => opt.setName('int').setDescription('INT').setRequired(false))
			.addIntegerOption(opt => opt.setName('wis').setDescription('WIS').setRequired(false))
			.addIntegerOption(opt => opt.setName('cha').setDescription('CHA').setRequired(false)))
		.addSubcommand(sub => sub
			.setName('mod')
			.setDescription('Modify character values by deltas (owner only)')
			.addStringOption(opt => opt.setName('target').setDescription('Character name or record id (defaults to active)').setRequired(false))
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
				.addStringOption(opt => opt.setName('name').setDescription('Condition name').setRequired(true))
				.addStringOption(opt => opt.setName('target').setDescription('Character name or record id (defaults to active)').setRequired(false)))
			.addSubcommand(sub => sub
				.setName('remove')
				.setDescription('Remove a condition')
				.addStringOption(opt => opt.setName('name').setDescription('Condition name').setRequired(true))
				.addStringOption(opt => opt.setName('target').setDescription('Character name or record id (defaults to active)').setRequired(false)))),

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

				// Start wizard
				startWizard({ userId: interaction.user.id, guildId: interaction.guildId, name });

				if (playbook && lookupPlaybook(playbook)) {
					// Playbook provided — select it and proceed to background step
					selectPlaybook(interaction.user.id, playbook);
				}

				const step = getStepInfo(interaction.user.id);
				const { embeds, components } = buildWizardStep(interaction, step);
				await interaction.reply({ embeds, components, ephemeral: true });
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

			if (sub === 'rename') {
				const newName = interaction.options.getString('new_name');
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active target:<name|id>` or pass a target to `/char rename`.', ephemeral: true });
					return;
				}
				if (record.kind === 'ambiguous') {
					setPending(interaction.user.id, { action: 'rename', payload: { newName } });
					await interaction.reply(disambiguationMessage({ target: record.target, matches: record.matches, action: 'rename' }));
					return;
				}
				if (record.kind === 'none') {
					await interaction.reply({ content: `No character found matching **${record.target}**.`, ephemeral: true });
					return;
				}
				if (record.kind === 'missing') {
					await interaction.reply({ content: 'No active character set.', ephemeral: true });
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

				await renameCharacter({ id: record.id, newName });
				await interaction.reply({ content: `Renamed character to **${newName}**.`, ephemeral: true });
				return;
			}

			if (sub === 'delete') {
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active target:<name|id>` or pass a target to `/char delete`.', ephemeral: true });
					return;
				}
				if (record.kind === 'ambiguous') {
					setPending(interaction.user.id, { action: 'delete' });
					await interaction.reply(disambiguationMessage({ target: record.target, matches: record.matches, action: 'delete' }));
					return;
				}
				if (record.kind === 'none') {
					await interaction.reply({ content: `No character found matching **${record.target}**.`, ephemeral: true });
					return;
				}
				if (record.kind === 'missing') {
					await interaction.reply({ content: 'No active character set.', ephemeral: true });
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

				// If deleting the active character, clear the mapping first.
				const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
				if (activeId === record.id) {
					await setActiveCharacter({ guildId: interaction.guildId, userId: interaction.user.id, characterId: null });
				}

				await deleteCharacter({ id: record.id });
				await interaction.reply({ content: `Deleted character **${record.name}**.`, ephemeral: true });
				return;
			}

			if (sub === 'active') {
				const target = interaction.options.getString('target');
				const res = await resolveCharacterTarget({ guildId: interaction.guildId, userId: interaction.user.id, target });
				if (res.kind === 'ambiguous') {
					setPending(interaction.user.id, { action: 'active' });
					await interaction.reply(disambiguationMessage({ target: res.target, matches: res.matches, action: 'active' }));
					return;
				}
				if (res.kind === 'none') {
					await interaction.reply({ content: `No character found matching **${res.target}**.`, ephemeral: true });
					return;
				}
				if (res.kind !== 'ok') {
					await interaction.reply({ content: 'Could not resolve character target.', ephemeral: true });
					return;
				}
				const record = res.record;
				if (record.guild_id !== interaction.guildId) {
					await interaction.reply({ content: 'That character id is not from this server.', ephemeral: true });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				await setActiveCharacter({ guildId: interaction.guildId, userId: interaction.user.id, characterId: record.id });
				await interaction.reply({ content: 'Set active character to **' + record.name + '** (`' + record.id + '`).', ephemeral: true });
				return;
			}

			async function resolveCharRecord() {
				const target = interaction.options.getString('target');
				if (target) {
					const res = await resolveCharacterTarget({ guildId: interaction.guildId, userId: interaction.user.id, target });
					if (res.kind === 'ok') return res.record;
					// Pass through object for error handling.
					return res;
				}
				const activeId = await getActiveCharacterId({ guildId: interaction.guildId, userId: interaction.user.id });
				if (!activeId) return null;
				return getCharacterById({ id: activeId });
			}

			if (sub === 'sheet') {
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active target:<name|id>` or pass a target to `/char sheet`.', ephemeral: true });
					return;
				}
				if (record.kind === 'ambiguous') {
					setPending(interaction.user.id, { action: 'sheet' });
					await interaction.reply(disambiguationMessage({ target: record.target, matches: record.matches, action: 'sheet' }));
					return;
				}
				if (record.kind === 'none') {
					await interaction.reply({ content: `No character found matching **${record.target}**.`, ephemeral: true });
					return;
				}
				if (record.kind === 'missing') {
					await interaction.reply({ content: 'No active character set.', ephemeral: true });
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

				// Add a Playbook button if the character has a playbook set.
				const components = [];
				if (record.playbook && lookupPlaybook(record.playbook)) {
					const row = new ActionRowBuilder()
						.addComponents(
							new ButtonBuilder()
								.setCustomId(`rhune:playbook:${record.id}`)
								.setLabel('View Playbook')
								.setStyle(ButtonStyle.Primary),
						);
					components.push(row);
				}

				await interaction.reply({ embeds: [embed], components, ephemeral: true });
				return;
			}

			if (sub === 'set') {
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.reply({ content: 'No active character set. Use `/char active target:<name|id>` or pass a target to `/char set`.', ephemeral: true });
					return;
				}
				if (record.kind === 'ambiguous') {
					const patch = {};
					const stats = {};
					for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha']) {
						const val = interaction.options.getInteger(key);
						if (val !== null) stats[key] = val;
					}
					if (Object.keys(stats).length) patch.stats = stats;
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

					setPending(interaction.user.id, { action: 'set', payload: { patch } });
					await interaction.reply(disambiguationMessage({ target: record.target, matches: record.matches, action: 'set' }));
					return;
				}
				if (record.kind === 'none') {
					await interaction.reply({ content: `No character found matching **${record.target}**.`, ephemeral: true });
					return;
				}
				if (record.kind === 'missing') {
					await interaction.reply({ content: 'No active character set.', ephemeral: true });
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
					await interaction.reply({ content: 'No active character set. Use `/char active target:<name|id>` or pass a target to `/char mod`.', ephemeral: true });
					return;
				}
				if (record.kind === 'ambiguous') {
					const hp = interaction.options.getInteger('hp');
					const hpMax = interaction.options.getInteger('hp_max');
					const xp = interaction.options.getInteger('xp');
					const loadCurrent = interaction.options.getInteger('load_current');
					const loadMax = interaction.options.getInteger('load_max');
					setPending(interaction.user.id, { action: 'mod', payload: { deltas: { hp, hp_max: hpMax, xp, load_current: loadCurrent, load_max: loadMax } } });
					await interaction.reply(disambiguationMessage({ target: record.target, matches: record.matches, action: 'mod' }));
					return;
				}
				if (record.kind === 'none') {
					await interaction.reply({ content: `No character found matching **${record.target}**.`, ephemeral: true });
					return;
				}
				if (record.kind === 'missing') {
					await interaction.reply({ content: 'No active character set.', ephemeral: true });
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
					await interaction.reply({ content: 'No active character set. Use `/char active target:<name|id>` or pass a target to `/char condition add`.', ephemeral: true });
					return;
				}
				if (record.kind === 'ambiguous') {
					const name = interaction.options.getString('name');
					setPending(interaction.user.id, { action: 'cond_add', payload: { name } });
					await interaction.reply(disambiguationMessage({ target: record.target, matches: record.matches, action: 'cond_add' }));
					return;
				}
				if (record.kind === 'none') {
					await interaction.reply({ content: `No character found matching **${record.target}**.`, ephemeral: true });
					return;
				}
				if (record.kind === 'missing') {
					await interaction.reply({ content: 'No active character set.', ephemeral: true });
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
					await interaction.reply({ content: 'No active character set. Use `/char active target:<name|id>` or pass a target to `/char condition remove`.', ephemeral: true });
					return;
				}
				if (record.kind === 'ambiguous') {
					const name = interaction.options.getString('name');
					setPending(interaction.user.id, { action: 'cond_remove', payload: { name } });
					await interaction.reply(disambiguationMessage({ target: record.target, matches: record.matches, action: 'cond_remove' }));
					return;
				}
				if (record.kind === 'none') {
					await interaction.reply({ content: `No character found matching **${record.target}**.`, ephemeral: true });
					return;
				}
				if (record.kind === 'missing') {
					await interaction.reply({ content: 'No active character set.', ephemeral: true });
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

	buildWizardStep,
};

// ===== Wizard UI builder (used by create handler and button handlers) =====

const PLAYBOOK_ORDER = ['Blessed', 'Fox', 'Heavy', 'Judge', 'Lightbearer', 'Marshal', 'Ranger', 'Seeker', 'WouldbeHero'];

function buildWizardStep(interaction, step) {
	if (!step) {
		return {
			embeds: [new EmbedBuilder().setDescription('Something went wrong. Please start again with /char create.')],
			components: [],
		};
	}

	switch (step.type) {
	case 'playbook_picker': {
		const embed = new EmbedBuilder()
			.setTitle('Create Character — Choose a Playbook')
			.setDescription('Each playbook has its own story and style. Read about them below, then pick one.');

		PLAYBOOK_ORDER.forEach(key => {
			const pb = lookupPlaybook(key);
			const die = pb.creationRules?.die || 'd6';
			const hp = pb.creationRules?.maxHP || '?';
			embed.addFields({
				name: pb.name,
				value: `*${pb.tagline}*
\`Damage ${die}  ·  Max HP ${hp}\``,
			});
		});

		const row1 = new ActionRowBuilder();
		const row2 = new ActionRowBuilder();
		PLAYBOOK_ORDER.forEach((key, i) => {
			const pb = lookupPlaybook(key);
			const btn = new ButtonBuilder()
				.setCustomId(`rhune:create:pickpb:${key}`)
				.setLabel(pb.name)
				.setStyle(ButtonStyle.Secondary);
			if (i < 5) row1.addComponents(btn);
			else row2.addComponents(btn);
		});

		return { embeds: [embed], components: [row1, row2] };
	}

	case 'background_picker': {
		const embed = new EmbedBuilder()
			.setTitle('Choose Your Background')
			.setDescription('Each background shapes your character\'s past and grants different moves. Read about your options below, then choose one.');

		step.backgrounds.forEach(bg => {
			const grantLine = bg.grants.length > 0 ? `\n*(Grants: ${bg.grants.join(', ')})*` : '';
			embed.addFields({
				name: bg.name.substring(0, 256),
				value: (bg.text + grantLine).substring(0, 1024),
			});
		});

		const row = new ActionRowBuilder();
		step.backgrounds.forEach(bg => {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`rhune:create:pickbg:${bg.name}`)
					.setLabel(bg.name.replace(/^The /, ''))
					.setStyle(ButtonStyle.Secondary),
			);
		});

		return { embeds: [embed], components: [row] };
	}

	case 'instinct_picker': {
		const embed = new EmbedBuilder()
			.setTitle('Choose Your Instinct')
			.setDescription('Your instinct is what drives you. It colors how you approach every situation. Read the options below, then pick one.');

		step.instincts.forEach(inst => {
			embed.addFields({
				name: inst.name.substring(0, 256),
				value: inst.desc.substring(0, 1024),
			});
		});

		const row = new ActionRowBuilder();
		step.instincts.forEach(inst => {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`rhune:create:pickinstinct:${inst.name}`)
					.setLabel(inst.name)
					.setStyle(ButtonStyle.Secondary),
			);
		});

		return { embeds: [embed], components: [row] };
	}

	case 'moves_picker': {
		const grantList = step.autoGranted.map(m => `• \`${m}\``).join('\n');

		let orStatus = '';
		if (step.orChoices) {
			orStatus = '\n\n**Choose from these groups:**\n';
			step.orChoices.forEach((group, i) => {
				const chosen = step.orSelections[i];
				orStatus += `\n${group.label}: `;
				group.options.forEach(o => {
					orStatus += chosen === o ? ` **✓ ${o}**` : ` ${o}`;
				});
			});
		}

		const remaining = step.maxPicks - step.currentPicks;
		const remainingText = remaining === 0 ? 'You have selected enough moves.' : `**Pick ${remaining} more move${remaining === 1 ? '' : 's'} from the dropdown below**`;
		const embedDesc = `**Automatically granted:**\n${grantList}${orStatus}\n\n${remainingText}`;

		const embed = new EmbedBuilder()
			.setTitle('Choose Your Starting Moves')
			.setDescription(embedDesc);

		const rows = [];

		// OR-group picker buttons (if any)
		if (step.orChoices) {
			step.orChoices.forEach((group, gi) => {
				const grpRow = new ActionRowBuilder();
				group.options.forEach(o => {
					const isSelected = Object.values(step.orSelections || {}).includes(o);
					grpRow.addComponents(
						new ButtonBuilder()
							.setCustomId(`rhune:create:orchoice:${gi}:${o}`)
							.setLabel(isSelected ? `✓ ${o}` : o)
							.setStyle(isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary),
					);
				});
				if (grpRow.components.length > 0) rows.push(grpRow);
			});
		}

		// Available moves as a dropdown (max 25 options fits in one row)
		if (step.available.length > 0) {
			const select = new StringSelectMenuBuilder()
				.setCustomId('rhune:create:selectmove')
				.setPlaceholder(remaining > 0 ? `Pick a move (${step.currentPicks}/${step.maxPicks} selected)` : 'All picks used')
				.setDisabled(remaining === 0)
				.setMinValues(1)
				.setMaxValues(Math.min(remaining || 1, step.available.length));

			step.available.forEach(m => {
				const isChosen = step.chosenMoves.includes(m.name);
				select.addOptions(
					new StringSelectMenuOptionBuilder()
						.setLabel(isChosen ? `✓ ${m.name}` : m.name)
						.setValue(m.name)
						.setDescription((m.text || '').substring(0, 100))
						.setDefault(isChosen),
				);
			});

			rows.push(new ActionRowBuilder().addComponents(select));
		}

		// Confirm / cancel row
		const actionRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('rhune:create:confirm')
					.setLabel('Create Character')
					.setStyle(ButtonStyle.Success)
					.setDisabled(remaining > 0),
				new ButtonBuilder()
					.setCustomId('rhune:create:cancel')
					.setLabel('Cancel')
					.setStyle(ButtonStyle.Danger),
			);
		rows.push(actionRow);

		return { embeds: [embed], components: rows };
	}

	case 'confirm': {
		const allMovesList = step.allMoves.map(m => `• ${m}`).join('\n');
		const embed = new EmbedBuilder()
			.setTitle('Confirm Character')
			.setDescription(
				`**Name:** ${step.name}\n` +
					`**Playbook:** ${step.playbook}\n` +
					`**Background:** ${step.background}\n` +
					`**Instinct:** ${step.instinct}\n\n` +
					`**Starting Moves:**\n${allMovesList}`,
			);

		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('rhune:create:finalize')
					.setLabel('Create & Set Active')
					.setStyle(ButtonStyle.Success),
				new ButtonBuilder()
					.setCustomId('rhune:create:cancel')
					.setLabel('Cancel')
					.setStyle(ButtonStyle.Danger),
			);

		return { embeds: [embed], components: [row] };
	}

	default:
		return {
			embeds: [new EmbedBuilder().setDescription('Unknown step. Please start again with /char create.')],
			components: [],
		};
	}
}
