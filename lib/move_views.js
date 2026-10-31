// Move reference views (shared by index.js and commands/move.js).
//
// Move names link straight to the public rules site; the bot no longer keeps
// an in-app move-detail view. Categories are buttons; each category view lists
// every move in that category as a link plus its "when…" trigger.

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { moves, categoryNames, getCategoryLabel } = require('./moves_data');
const { triggerFor } = require('./move_triggers');
const siteLinks = require('./site_links');

/** Root "Move Reference" view: category summary + category buttons. */
function buildMoveReferenceRoot() {
	const embed = new EmbedBuilder()
		.setTitle('📖 Move Reference')
		.setDescription('Pick a category to see its moves — each name links to the full rules on the site.');

	for (const cat of categoryNames) {
		const count = Object.keys(moves[cat]).length;
		embed.addFields({ name: getCategoryLabel(cat), value: `${count} move${count === 1 ? '' : 's'}`, inline: false });
	}

	const row = new ActionRowBuilder().addComponents(
		...categoryNames.map(cat =>
			new ButtonBuilder()
				.setCustomId('rhune:move:cat:' + cat)
				.setLabel(getCategoryLabel(cat))
				.setStyle(ButtonStyle.Secondary),
		),
	);

	return { embeds: [embed], components: [row] };
}

/** Category view: every move as a site link (+ trigger), category buttons below. */
function buildMoveCategoryView(category) {
	const names = Object.keys(moves[category]);
	const lines = names.map(name => {
		const url = siteLinks.moveUrl(name, null);
		const label = url ? `[${name}](${url})` : name;
		const t = triggerFor(name);
		return `• ${label}${t ? ` — ${t}` : ''}`;
	});

	const embed = new EmbedBuilder()
		.setTitle(getCategoryLabel(category))
		.setDescription(`${names.length} move${names.length === 1 ? '' : 's'}.\n\n${lines.join('\n')}`.slice(0, 4096));

	const row = new ActionRowBuilder().addComponents(
		...categoryNames.map(cat =>
			new ButtonBuilder()
				.setCustomId('rhune:move:cat:' + cat)
				.setLabel(getCategoryLabel(cat))
				.setStyle(cat === category ? ButtonStyle.Primary : ButtonStyle.Secondary),
		),
	);

	return { embeds: [embed], components: [row] };
}

module.exports = { buildMoveReferenceRoot, buildMoveCategoryView };
