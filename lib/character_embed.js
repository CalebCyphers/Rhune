const { EmbedBuilder } = require('discord.js');

const { listConditions } = require('./conditions_pb');
const { cutMarkdown } = require('./format');
const { getTraits } = require('./traits');
const { lookupPlaybook, parseChoices, getCharacterMoveList } = require('./playbooks');
const siteLinks = require('./site_links');
// Inventory is intentionally *not* rendered on the main sheet.
// The Load/Outfit inventory insert is handled via /inv (playbook-style) UI.

function safeInline(v) {
	const s = String(v ?? '').trim();
	return s.length ? s : '—';
}

function formatTraitBlock(traits) {
	if (!traits.length) return '—';
	return traits.map(t => {
		const marks = [t.improved ? '★' : null, t.superior ? '★★' : null].filter(Boolean).join('');
		const name = marks ? `${marks} ${t.name}` : t.name;
		return `• **${name}** — ${t.text}`;
	}).join('\n');
}

async function renderCharacterSheetEmbed(characterRecord) {
	const conditions = await listConditions({ characterId: characterRecord.id });

	const traits = getTraits(characterRecord);

	// Parse special possessions from choices
	let specialPossessions = [];
	if (characterRecord.choices) {
		let parsed = characterRecord.choices;
		if (typeof parsed === 'string') {
			try { parsed = JSON.parse(parsed); }
			catch { parsed = {}; }
		}
		if (Array.isArray(parsed.chosen_possessions)) {
			specialPossessions = parsed.chosen_possessions;
		}
	}

	const embed = new EmbedBuilder()
		.setTitle(characterRecord.name)
		.addFields(
			{ name: 'HP', value: `\`${safeInline(characterRecord.hp)}/${safeInline(characterRecord.hp_max)}\``, inline: true },
			{ name: 'XP', value: `\`${String(characterRecord.xp ?? 0)}\``, inline: true },
			{ name: 'Debilities', value: `\`${Array.isArray(characterRecord.debilities) && characterRecord.debilities.length ? characterRecord.debilities.join(', ') : '—'}\``, inline: true },
		);

	// Playbook-derived basics (damage, background, instinct, moves) live right on
	// the sheet now, each linked to its full text on the rules site. There is no
	// separate playbook view.
	const pb = characterRecord.playbook ? lookupPlaybook(characterRecord.playbook) : null;
	if (pb) {
		const choices = parseChoices(characterRecord.choices);
		const die = pb.creationRules?.die || null;
		const background = choices.background || null;
		const instinct = choices.instinct || null;

		const basicsRow = [];
		if (die) basicsRow.push({ name: 'Damage Die', value: `\`${die}\``, inline: true });
		if (background) {
			const url = siteLinks.backgroundUrl(characterRecord.playbook, background);
			basicsRow.push({ name: 'Background', value: url ? `[${background}](${url})` : background, inline: true });
		}
		if (instinct) {
			const url = siteLinks.instinctUrl(characterRecord.playbook);
			basicsRow.push({ name: 'Instinct', value: url ? `[${instinct}](${url})` : instinct, inline: true });
		}
		if (basicsRow.length) embed.addFields(...basicsRow);

		const moves = getCharacterMoveList(characterRecord, pb);
		if (moves.length) {
			const moveList = moves.map(m => {
				const url = siteLinks.moveUrl(m, characterRecord.playbook);
				return url ? `• [${m}](${url})` : `• ${m}`;
			}).join('\n');
			const movesUrl = siteLinks.playbookMovesUrl(characterRecord.playbook);
			embed.addFields({
				name: movesUrl ? `Moves — [full playbook ↗](${movesUrl})` : 'Moves',
				value: cutMarkdown(moveList, 1024),
				inline: false,
			});
		}
	}

	const traitsHeader = siteLinks.TRAIT_LIST_URL
		? `Traits — [full list ↗](${siteLinks.TRAIT_LIST_URL})`
		: 'Traits';
	embed.addFields(
		{ name: traitsHeader, value: cutMarkdown(formatTraitBlock(traits), 1024), inline: false },
	);

	const condText = conditions.length
		? conditions.map(c => c.name).slice(0, 10).join(', ')
		: '—';
	embed.addFields({ name: 'Conditions', value: `\`${condText}\``, inline: false });

	if (specialPossessions.length) {
		embed.addFields({ name: 'Special Possessions', value: `\`${specialPossessions.map(p => `• ${p}`).join('\n')}\``, inline: false });
	}

	// (Inventory removed from sheet embed; see note at top.)

	// Quiet pointer to the rules site. (Footers can't be links in Discord, so
	// the Rules ↗ button on the action row carries the actual URL.)
	embed.setFooter({ text: pb ? `${pb.name} — Rules: rhune.xyz` : 'Rules: rhune.xyz' });
	embed.setTimestamp(new Date());
	return embed;
}

module.exports = {
	renderCharacterSheetEmbed,
};
