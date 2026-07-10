const { getCharacterById, findCharactersByName, getActiveCharacterId } = require('./characters_pb');

function isLikelyId(s) {
	return typeof s === 'string' && /^[a-z0-9]{15,}$/.test(s);
}

async function resolveCharacterTarget({ guildId, userId, target }) {
	// No target: default to active character
	if (!target) {
		const activeId = await getActiveCharacterId({ guildId, userId });
		if (!activeId) {
			return { kind: 'missing' };
		}
		const record = await getCharacterById({ id: activeId });
		return { kind: 'ok', record };
	}

	// ID direct
	if (isLikelyId(target)) {
		const record = await getCharacterById({ id: target });
		return { kind: 'ok', record };
	}

	// Name search (fuzzy/contains)
	const matches = await findCharactersByName({ guildId, name: target });
	if (!matches.length) {
		return { kind: 'none', target };
	}
	if (matches.length === 1) {
		return { kind: 'ok', record: matches[0] };
	}

	// More than one match
	return { kind: 'ambiguous', target, matches };
}

module.exports = { resolveCharacterTarget };
