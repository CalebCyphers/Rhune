// Edit-view embed + component builders.
//
// The sheet's Edit button opens a small editing surface (HP, max HP, XP,
// debilities) with two sub-views for managing traits and moves. Sub-views use
// select menus (paged at 25 options, Discord's per-select cap) plus a modal
// for freeform custom traits.

const {
	EmbedBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuBuilder,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
} = require('discord.js');

const { TRAIT_BY_NAME, TRAIT_NAMES } = require('./traits_data');
const { getTraits, traitLine } = require('./traits');
const { lookupPlaybook, getCharacterMoveList } = require('./playbooks');
const { MAX_TRAITS } = require('./edit_ops');

const SELECT_PAGE_SIZE = 25;
const CUSTOM_TRAIT_MODAL_NAME_ID = 'trait_name';
const CUSTOM_TRAIT_MODAL_TEXT_ID = 'trait_text';

function clip(str, n) {
	const s = String(str ?? '');
	return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

function pageSlice(items, page) {
	const maxPage = Math.max(0, Math.ceil(items.length / SELECT_PAGE_SIZE) - 1);
	const p = Math.max(0, Math.min(page, maxPage));
	return { page: p, maxPage, slice: items.slice(p * SELECT_PAGE_SIZE, (p + 1) * SELECT_PAGE_SIZE) };
}

function pageRow(baseCustomId, page, maxPage, extraButtons = []) {
	const row = new ActionRowBuilder();
	row.addComponents(
		new ButtonBuilder()
			.setCustomId(`${baseCustomId}:${page - 1}`)
			.setLabel('◀')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page <= 0),
		new ButtonBuilder()
			.setCustomId(`${baseCustomId}:${page}`)
			.setLabel(`${page + 1}/${maxPage + 1}`)
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(true),
		new ButtonBuilder()
			.setCustomId(`${baseCustomId}:${page + 1}`)
			.setLabel('▶')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(page >= maxPage),
	);
	for (const b of extraButtons) row.addComponents(b);
	return row;
}

// ---------------------------------------------------------------------------
// Main edit view
// ---------------------------------------------------------------------------

function buildEditView(record) {
	const debils = Array.isArray(record.debilities)
		? record.debilities.filter(Boolean)
		: [];

	const allDebilities = ['Weakened', 'Dazed', 'Miserable'];
	const debilDesc = allDebilities.map(d => `${debils.includes(d) ? '☑' : '☐'} ${d}`).join('\n');

	const traits = getTraits(record);
	const pb = lookupPlaybook(record.playbook);
	const moveCount = pb ? getCharacterMoveList(record, pb).length : 0;

	const editEmbed = new EmbedBuilder()
		.setTitle(`Editing: ${record.name}`)
		.setDescription([
			`**HP:** \`${record.hp ?? '?'}/${record.hp_max ?? '?'}\``,
			`**XP:** \`${record.xp ?? 0}\``,
			`**Debilities:**\n${debilDesc}`,
			`**Traits (${traits.length}):** ${traits.length ? traits.map(t => t.name).join(', ') : '_none_'}`,
			`**Moves:** ${pb ? `${moveCount} known` : '_no playbook_'}`,
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
			new ButtonBuilder()
				.setCustomId(`rhune:editmaxhp:${record.id}:-`)
				.setLabel('Max HP −1')
				.setStyle(ButtonStyle.Danger),
			new ButtonBuilder()
				.setCustomId(`rhune:editmaxhp:${record.id}:+`)
				.setLabel('Max HP +1')
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

	const navRow = new ActionRowBuilder()
		.addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:edittraits:${record.id}`)
				.setLabel('Traits ✎')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId(`rhune:editmoves:${record.id}`)
				.setLabel('Moves ✎')
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(!pb),
			new ButtonBuilder()
				.setCustomId(`rhune:editdone:${record.id}`)
				.setLabel('Done')
				.setStyle(ButtonStyle.Primary),
		);

	return {
		editEmbed,
		editComponents: [hpRow, xpRow, debilRow, navRow],
	};
}

// ---------------------------------------------------------------------------
// Traits sub-view
// ---------------------------------------------------------------------------

function buildTraitsEditView(record, page = 0) {
	const traits = getTraits(record);
	const ownedUpper = new Set(traits.map(t => t.name.toUpperCase()));
	const available = TRAIT_NAMES.filter(n => !ownedUpper.has(n)).sort();
	const { page: p, maxPage, slice } = pageSlice(available, page);

	const listText = traits.length
		? traits.map(t => `• **${traitLine(t)}** — ${clip(t.text, 140)}`).join('\n')
		: '_No traits._';

	const embed = new EmbedBuilder()
		.setTitle(`Editing traits: ${record.name}`)
		.setDescription([
			listText,
			'',
			`_Add from the catalog below (page ${p + 1}/${maxPage + 1}), or write a custom trait._`,
		].join('\n'))
		.setTimestamp(new Date());

	const components = [];

	if (slice.length) {
		const addSelect = new StringSelectMenuBuilder()
			.setCustomId(`rhune:edittraitadd:${record.id}:${p}`)
			.setPlaceholder(traits.length >= MAX_TRAITS ? `Trait cap reached (${MAX_TRAITS})` : 'Add a trait…')
			.setDisabled(traits.length >= MAX_TRAITS)
			.addOptions(slice.map(name => ({
				label: clip(name, 100),
				value: name,
				description: clip(TRAIT_BY_NAME[name]?.species ?? '', 100),
			})));
		components.push(new ActionRowBuilder().addComponents(addSelect));
	}

	components.push(pageRow(`rhune:edittraitpage:${record.id}`, p, maxPage, [
		new ButtonBuilder()
			.setCustomId(`rhune:edittraitcustom:${record.id}`)
			.setLabel('Custom trait ✎')
			.setStyle(ButtonStyle.Secondary)
			.setDisabled(traits.length >= MAX_TRAITS),
	]));

	if (traits.length) {
		const removeSelect = new StringSelectMenuBuilder()
			.setCustomId(`rhune:edittraitdel:${record.id}`)
			.setPlaceholder('Remove a trait…')
			.addOptions(traits.slice(0, SELECT_PAGE_SIZE).map(t => ({ label: clip(t.name, 100), value: t.name })));
		components.push(new ActionRowBuilder().addComponents(removeSelect));
	}

	components.push(new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:editback:${record.id}`)
			.setLabel('← Back')
			.setStyle(ButtonStyle.Primary),
	));

	return { embeds: [embed], components };
}

/** Modal for a freeform custom trait (name + rules text). */
function buildCustomTraitModal(charId) {
	const modal = new ModalBuilder()
		.setCustomId(`rhune:edittraitmodal:${charId}`)
		.setTitle('Custom trait');

	const nameInput = new TextInputBuilder()
		.setCustomId(CUSTOM_TRAIT_MODAL_NAME_ID)
		.setLabel('Trait name')
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMaxLength(80)
		.setPlaceholder('e.g. BLOOD OF THE OLD OAK');

	const textInput = new TextInputBuilder()
		.setCustomId(CUSTOM_TRAIT_MODAL_TEXT_ID)
		.setLabel('What it does')
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(true)
		.setMaxLength(1000)
		.setPlaceholder('Rules text for the trait.');

	modal.addComponents(
		new ActionRowBuilder().addComponents(nameInput),
		new ActionRowBuilder().addComponents(textInput),
	);
	return modal;
}

// ---------------------------------------------------------------------------
// Moves sub-view
// ---------------------------------------------------------------------------

function buildMovesEditView(record, page = 0) {
	const pb = lookupPlaybook(record.playbook);
	if (!pb) {
		const embed = new EmbedBuilder()
			.setTitle(`Editing moves: ${record.name}`)
			.setDescription('_No playbook — moves can\'t be edited._');
		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId(`rhune:editback:${record.id}`)
				.setLabel('← Back')
				.setStyle(ButtonStyle.Primary),
		);
		return { embeds: [embed], components: [row] };
	}

	const current = getCharacterMoveList(record, pb);
	const ownedSet = new Set(current);
	const available = Object.keys(pb.allMoves || {}).filter(n => !ownedSet.has(n)).sort();
	const { page: p, maxPage, slice } = pageSlice(available, page);

	const embed = new EmbedBuilder()
		.setTitle(`Editing moves: ${record.name}`)
		.setDescription([
			`**${pb.name} moves known (${current.length}):**`,
			current.length ? current.map(m => `• ${m}`).join('\n') : '_None._',
			'',
			`_Add from the playbook below (page ${p + 1}/${maxPage + 1}). Full text lives on rhune.xyz._`,
		].join('\n'))
		.setTimestamp(new Date());

	const components = [];

	if (slice.length) {
		const addSelect = new StringSelectMenuBuilder()
			.setCustomId(`rhune:editmoveadd:${record.id}:${p}`)
			.setPlaceholder('Add a move…')
			.addOptions(slice.map(name => ({
				label: clip(name, 100),
				value: name,
				description: clip((pb.allMoves[name]?.text ?? '').replace(/\n/g, ' '), 100),
			})));
		components.push(new ActionRowBuilder().addComponents(addSelect));
	}

	if (maxPage > 0) {
		components.push(pageRow(`rhune:editmovepage:${record.id}`, p, maxPage));
	}

	if (current.length) {
		const removeSelect = new StringSelectMenuBuilder()
			.setCustomId(`rhune:editmovedel:${record.id}`)
			.setPlaceholder('Remove a move…')
			.addOptions(current.slice(0, SELECT_PAGE_SIZE).map(m => ({ label: clip(m, 100), value: m })));
		components.push(new ActionRowBuilder().addComponents(removeSelect));
	}

	components.push(new ActionRowBuilder().addComponents(
		new ButtonBuilder()
			.setCustomId(`rhune:editback:${record.id}`)
			.setLabel('← Back')
			.setStyle(ButtonStyle.Primary),
	));

	return { embeds: [embed], components };
}

module.exports = {
	buildEditView,
	buildTraitsEditView,
	buildCustomTraitModal,
	buildMovesEditView,
	CUSTOM_TRAIT_MODAL_NAME_ID,
	CUSTOM_TRAIT_MODAL_TEXT_ID,
};
