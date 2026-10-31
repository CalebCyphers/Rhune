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
const { buildSheetButtons } = require('../lib/sheet_buttons');
const siteLinks = require('../lib/site_links');
const { startWizard, getStepInfo, selectPlaybook } = require('../lib/create_wizard');
const { addCondition, removeCondition } = require('../lib/conditions_pb');
const { resolveCharacterTarget } = require('../lib/resolve_target');
const { disambiguationMessage } = require('../lib/disambiguation');
const { setPending } = require('../lib/pending_actions');
const { isGuildOwner } = require('../lib/gm');

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
			.addIntegerOption(opt => opt.setName('load_max').setDescription('Max load (manual)').setRequired(false)))
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

			// Guild owner = GM. GMs may check & edit any character in the guild.
			const isGm = await isGuildOwner(interaction, interaction.user.id);

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

				// Listing all characters in the server is a GM (guild owner) action.
				if (all && !isGm) {
					await interaction.reply({ content: 'Only the guild owner can list all characters in this server.', ephemeral: true });
					return;
				}

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
					// GM list shows who made each character; players just see their own.
					const ownerText = all && c.owner_user_id ? ` — <@${c.owner_user_id}>` : '';
					return `• **${c.name}**${playbookText} — \`${c.id}\`${ownerText}${activeMark}`;
				});

				await interaction.reply({ content: lines.join('\n'), ephemeral: true });
				return;
			}

			if (sub === 'rename') {
				await interaction.deferReply({ flags: 64 });
				const newName = interaction.options.getString('new_name');
				const record = await resolveCharRecord();
				if (!record) {
					await interaction.editReply({ content: 'No active character set. Use `/char active target:<name|id>` or pass a target to `/char rename`.' });
					return;
				}
				if (record.kind === 'ambiguous') {
					setPending(interaction.user.id, { action: 'rename', payload: { newName } });
					await interaction.editReply(disambiguationMessage({ target: record.target, matches: record.matches, action: 'rename' }));
					return;
				}
				if (record.kind === 'none') {
					await interaction.editReply({ content: `No character found matching **${record.target}**.` });
					return;
				}
				if (record.kind === 'missing') {
					await interaction.editReply({ content: 'No active character set.' });
					return;
				}
				if (record.guild_id !== interaction.guildId) {
					await interaction.editReply({ content: 'That character is not from this server.' });
					return;
				}
				if (record.owner_user_id !== interaction.user.id) {
					await interaction.editReply({ content: 'You do not own that character.' });
					return;
				}

				await renameCharacter({ id: record.id, newName });
				await interaction.editReply({ content: `Renamed character to **${newName}**.` });
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

				// Sheet: owner, or the guild owner (GM) may view any character in the guild.
				if (record.owner_user_id !== interaction.user.id && !isGm) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				const embed = await renderCharacterSheetEmbed(record);

				// Sheet action buttons (shared builder; includes the Rules ↗ link).
				const components = [buildSheetButtons(record)];

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
				if (record.owner_user_id !== interaction.user.id && !isGm) {
					await interaction.reply({ content: 'You do not own that character.', ephemeral: true });
					return;
				}

				const patch = {};

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
				if (record.owner_user_id !== interaction.user.id && !isGm) {
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
				if (record.owner_user_id !== interaction.user.id && !isGm) {
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
				if (record.owner_user_id !== interaction.user.id && !isGm) {
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
			const url = siteLinks.playbookUrl(key);
			const link = url ? `[Read the ${pb.name} →](${url})` : '';
			embed.addFields({
				name: pb.name,
				value: `*${pb.tagline}*
` +
					`\`Damage ${die}  ·  Max HP ${hp}\`` +
					(link ? `
${link}` : ''),
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
			const grantLine = bg.grants.length > 0 ? `*(Grants: ${bg.grants.join(', ')})*` : '';
			const url = siteLinks.backgroundUrl(step.playbookKey, bg.name);
			const link = url ? `[Read the full background →](${url})` : '';
			embed.addFields({
				name: bg.name.substring(0, 256),
				value: ([grantLine, link].filter(Boolean).join('\n') || '—').substring(0, 1024),
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

		const navRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('rhune:create:back')
					.setLabel('‹ Back')
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId('rhune:create:cancel')
					.setLabel('Cancel')
					.setStyle(ButtonStyle.Danger),
			);

		return { embeds: [embed], components: [row, navRow] };
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

		// Deep link to the playbook's Instinct section on the rules site.
		{
			const url = siteLinks.instinctUrl(step.playbookKey);
			if (url) embed.setDescription(`${embed.data.description}\n\n[Read the full Instincts list →](${url})`);
		}

		const row = new ActionRowBuilder();
		step.instincts.forEach(inst => {
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`rhune:create:pickinstinct:${inst.name}`)
					.setLabel(inst.name)
					.setStyle(ButtonStyle.Secondary),
			);
		});

		const navRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('rhune:create:back')
					.setLabel('‹ Back')
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId('rhune:create:cancel')
					.setLabel('Cancel')
					.setStyle(ButtonStyle.Danger),
			);

		return { embeds: [embed], components: [row, navRow] };
	}

	case 'traits_picker': {
		const speciesOrder = step.speciesOrder || [];
		const current = step.species;
		const chosen = step.chosen || [];
		const remaining = step.remaining;
		const pickCount = step.pickCount || 2;

		const chosenBlock = chosen.length
			? chosen.map(n => {
				const t = step.traits.find(x => x.name === n);
				return `• **${n}** — ${t ? t.text : ''}`;
			}).join('\n')
			: '_None yet._';

		const desc = `Pick **${pickCount} traits** from the shared list. Traits aren't locked to a species — pick anything, but be ready to **explain how it applies to you**.

` +
			`Browse species below, then toggle traits on. You can rename or rewrite them later on your sheet.\n` +
			`[See the full trait list on the rules site →](${siteLinks.TRAIT_LIST_URL})\n\n` +
			`**${current}** *(${step.flavor || ''})*\n` +
			step.traits.map(t => `• **${t.name}** — ${t.text}`).join('\n') +
			`\n\n**Picked (${chosen.length}/${pickCount})**\n${chosenBlock}`;

		const embed = new EmbedBuilder()
			.setTitle('Pick Your Traits')
			.setDescription(desc.slice(0, 4096));

		const rows = [];

		// Species select menu
		const speciesMenu = new StringSelectMenuBuilder()
			.setCustomId('rhune:create:selectspecies')
			.setPlaceholder('Browse a species…')
			.addOptions(speciesOrder.map(sp => ({
				label: sp,
				value: sp,
				default: sp === current,
			})));
		rows.push(new ActionRowBuilder().addComponents(speciesMenu));

		// Trait toggle buttons
		const traitRow = new ActionRowBuilder();
		step.traits.forEach(t => {
			const isChosen = chosen.includes(t.name);
			traitRow.addComponents(
				new ButtonBuilder()
					.setCustomId(`rhune:create:toggletrait:${t.name}`)
					.setLabel(`${isChosen ? '✓ ' : ''}${t.name}`)
					.setStyle(isChosen ? ButtonStyle.Success : ButtonStyle.Secondary),
			);
		});
		rows.push(traitRow);

		// Navigation row
		rows.push(new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId('rhune:create:back')
				.setLabel('‹ Back')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId('rhune:create:confirm')
				.setLabel(remaining > 0 ? `Pick ${remaining} more` : 'Traits Chosen — Continue')
				.setStyle(ButtonStyle.Success)
				.setDisabled(remaining > 0),
			new ButtonBuilder()
				.setCustomId('rhune:create:cancel')
				.setLabel('Cancel')
				.setStyle(ButtonStyle.Danger),
		));

		return { embeds: [embed], components: rows };
	}

	case 'moves_picker': {
		// Show auto-granted moves (names only; details live on the rules site).
		let grantList = '';
		step.autoGranted.forEach(m => {
			grantList += `• **${m}**\n`;
		});

		let orStatus = '';
		if (step.orGroups) {
			step.orGroups.forEach((group, i) => {
				const chosen = step.orSelections[i];
				const pkg = chosen ? group.options.find(o => o.name === chosen) : null;
				orStatus += `\n\n**${group.label}:**`;
				if (chosen && pkg) {
					// Show each granted move (names only).
					pkg.grants.forEach(m => {
						orStatus += `\n  ✓ **${m}**`;
					});
				}
				else {
					group.options.forEach(p => {
						orStatus += `\n  • **${p.name}**: ${p.grants.join(', ')}`;
					});
				}
			});
		}

		const remaining = step.maxPicks - step.currentPicks;

		let chosenMovesList = '';
		if (step.currentPicks > 0) {
			step.chosenMoves.forEach(m => {
				chosenMovesList += `\n  ✓ **${m}**`;
			});
		}
		let remainingText = chosenMovesList ? `**Selected moves:**${chosenMovesList}` : '';
		if (remaining > 0 && step.currentPicks > 0) {
			remainingText += `\n\n_Pick ${remaining} more from the dropdown below._`;
		}
		else if (remaining > 0 && step.currentPicks === 0) {
			remainingText = `**Pick ${remaining} move${remaining === 1 ? '' : 's'} from the dropdown below**`;
		}
		else if (step.currentPicks > 0) {
			remainingText += '\n\n_All picks made. Use the dropdown to swap if desired._';
		}
		const optionLimit = 25;
		const overflow = Math.max(0, step.available.length - optionLimit);
		const availableSlice = step.available.slice(0, optionLimit);
		if (overflow > 0) {
			remainingText += `\n\n_(${overflow} more moves available — browse with \`/move\` after creation.)_`;
		}

		// Deep link to the playbook's Moves section on the rules site.
		const movesSectionUrl = siteLinks.playbookMovesUrl(step.playbookKey);
		const movesLink = movesSectionUrl ? `
[Browse the full move list →](${movesSectionUrl})` : '';

		const embedDesc = `**Automatically granted:**\n${grantList}${orStatus}\n\n${remainingText}${movesLink}`;

		const embed = new EmbedBuilder()
			.setTitle('Choose Your Starting Moves')
			.setDescription(embedDesc);

		const rows = [];

		// OR-group picker dropdowns (each group = one dropdown where you pick a package)
		if (step.orGroups) {
			step.orGroups.forEach((group, gi) => {
				const selectedPkg = step.orSelections[gi];
				const select = new StringSelectMenuBuilder()
					.setCustomId(`rhune:create:orchoice:${gi}`)
					.setPlaceholder(selectedPkg || 'Choose...')
					.setMinValues(1)
					.setMaxValues(1);

				group.options.forEach(pkg => {
					const label = `${pkg.name}: ${pkg.grants.join(', ')}`;
					select.addOptions(
						new StringSelectMenuOptionBuilder()
							.setLabel(label.substring(0, 100))
							.setValue(pkg.name)
							.setDefault(selectedPkg === pkg.name),
					);
				});

				rows.push(new ActionRowBuilder().addComponents(select));
			});
		}

		// Available moves as a dropdown (always enabled — allows swapping picks)
		// NOTE: Discord requires max_values >= 1 when the component exists.
		// Some playbooks can have 0 free picks (maxPicks=0); in that case we should not render the select at all.
		if (availableSlice.length > 0 && step.maxPicks > 0) {
			const select = new StringSelectMenuBuilder()
				.setCustomId('rhune:create:selectmove')
				.setPlaceholder(`Pick moves (${step.currentPicks}/${step.maxPicks} selected) — reselect to swap`)
				.setDisabled(false)
				.setMinValues(1)
				.setMaxValues(Math.min(step.maxPicks, availableSlice.length));

			availableSlice.forEach(m => {
				const isChosen = step.chosenMoves.includes(m.name);
				const opt = new StringSelectMenuOptionBuilder()
					.setLabel(isChosen ? `✓ ${m.name}` : m.name)
					.setValue(m.name);
				if (isChosen) {
					opt.setDefault(true);
				}
				select.addOptions(opt);
			});

			rows.push(new ActionRowBuilder().addComponents(select));
		}

		// Determine if all OR-groups are filled (if any exist)
		const orGroupsFilled = !step.orGroups || step.orGroups.every((g, i) => step.orSelections[i]);

		// Confirm / back / cancel row
		const actionRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('rhune:create:back')
					.setLabel('‹ Back')
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId('rhune:create:confirm')
					.setLabel('Continue')
					.setStyle(ButtonStyle.Success)
					.setDisabled(!orGroupsFilled || remaining > 0),
				new ButtonBuilder()
					.setCustomId('rhune:create:cancel')
					.setLabel('Cancel')
					.setStyle(ButtonStyle.Danger),
			);
		rows.push(actionRow);

		return { embeds: [embed], components: rows };
	}

	case 'possessions_picker': {
		const options = step.options || [];
		const always = step.always || [];
		const chosen = step.chosen || [];
		const pickCount = step.pickCount || 0;
		const remaining = pickCount - chosen.length;

		const alwaysText = always.length
			? `**Always included:**\n${always.map(a => `• ${a}`).join('\n')}\n\n`
			: '';

		const embed = new EmbedBuilder()
			.setTitle('Special Possessions')
			.setDescription(
				`${alwaysText}**Pick ${pickCount} special possession${pickCount === 1 ? '' : 's'} from below.**\n` +
				`${remaining <= 0 ? 'Ready! Press Continue when done.' : `${remaining} more to pick.`}`,
			);

		// Max 5 buttons per row, 5 rows = 25 options max
		const rows = [];
		let row = new ActionRowBuilder();
		for (const opt of options) {
			const isActive = chosen.includes(opt.name);
			row.addComponents(
				new ButtonBuilder()
					.setCustomId(`rhune:create:togglepossession:${opt.name}`)
					.setLabel(isActive ? `✓ ${opt.name}` : opt.name.slice(0, 80))
					.setStyle(isActive ? ButtonStyle.Success : ButtonStyle.Secondary),
			);
			if (row.components.length === 5) {
				rows.push(row);
				row = new ActionRowBuilder();
				if (rows.length === 5) break;
			}
		}
		if (row.components.length) rows.push(row);

		const actionRow = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('rhune:create:back')
					.setLabel('‹ Back to Moves')
					.setStyle(ButtonStyle.Secondary),
				new ButtonBuilder()
					.setCustomId('rhune:create:confirm')
					.setLabel('Review Character')
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
		let allMovesList = '';
		step.allMoves.forEach(m => {
			const url = siteLinks.moveUrl(m, step.playbookKey);
			allMovesList += url ? `• **[${m}](${url})**\n` : `• **${m}** — *not on the site yet*\n`;
		});

		const traitsLine = (step.traits || []).length
			? step.traits.map(t => `• **${t.name}** — ${t.text}`).join('\n')
			: '—';

		// Rules-site links for the summary lines.
		const pbUrl = siteLinks.playbookUrl(step.playbookKey);
		const bgUrl = siteLinks.backgroundUrl(step.playbookKey, step.background);
		const instUrl = siteLinks.instinctUrl(step.playbookKey);
		const link = (label, url) => (url ? `[${label}](${url})` : label);

		const embed = new EmbedBuilder()
			.setTitle('Confirm Character')
			.setDescription(
				`**Name:** ${step.name}\n` +
				`**Playbook:** ${link(step.playbook, pbUrl)}\n` +
				`**Background:** ${link(step.background, bgUrl)}\n` +
				`**Instinct:** ${link(step.instinct, instUrl)}\n\n` +
				`**Traits:**\n${traitsLine}\n` +
				`[Full trait list →](${siteLinks.TRAIT_LIST_URL})\n\n` +
				`**Starting Moves:**\n${allMovesList}` +
				`\n**Special Possessions:**\n${(step.possessions || []).length ? step.possessions.map(p => `• ${p}`).join('\n') : '—'}`,
			);

		const row = new ActionRowBuilder()
			.addComponents(
				new ButtonBuilder()
					.setCustomId('rhune:create:back')
					.setLabel('‹ Back')
					.setStyle(ButtonStyle.Secondary),
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
