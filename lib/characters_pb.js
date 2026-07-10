const { getPb } = require('./pb');

const COLLECTION = process.env.PB_CHARACTERS_COLLECTION || 'rhune_characters';
const ACTIVE_COLLECTION = process.env.PB_ACTIVE_COLLECTION || 'rhune_user_active_character';

function escapeFilterValue(v) {
	return String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function createCharacter({ guildId, ownerUserId, name, playbook = null, stats = null, hp = null, hpMax = null, xp = 0, loadCurrent = 0, loadMax = 0 }) {
	const pb = await getPb();

	// PocketBase validation expects required numeric fields to be present and non-null.
	const xpVal = xp ?? 0;
	const loadCurrentVal = loadCurrent ?? 0;
	const loadMaxVal = loadMax ?? 0;

	return pb.collection(COLLECTION).create({
		guild_id: guildId,
		owner_user_id: ownerUserId,
		name,
		playbook,
		stats,
		hp,
		hp_max: hpMax,
		xp: xpVal,
		load_current: loadCurrentVal,
		load_max: loadMaxVal,
	});
}

async function listCharacters({ guildId, ownerUserId = null }) {
	const pb = await getPb();
	const parts = [`guild_id = "${escapeFilterValue(guildId)}"`];
	if (ownerUserId) parts.push(`owner_user_id = "${escapeFilterValue(ownerUserId)}"`);
	const filter = parts.join(' && ');
	return pb.collection(COLLECTION).getFullList({
		sort: 'name',
		filter,
	});
}

async function getCharacterById({ id }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).getOne(id);
}

async function findCharactersByName({ guildId, name }) {
	const pb = await getPb();
	// Case-insensitive contains match. (PocketBase uses SQLite LIKE; this is usually case-insensitive for ASCII.)
	const filter = `guild_id = "${escapeFilterValue(guildId)}" && name ~ "${escapeFilterValue(name)}"`;
	return pb.collection(COLLECTION).getFullList({ sort: 'name', filter });
}

async function deleteCharacter({ id }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).delete(id);
}

async function renameCharacter({ id, newName }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).update(id, { name: newName });
}

async function updateCharacter({ id, patch }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).update(id, patch);
}

async function setActiveCharacter({ guildId, userId, characterId }) {
	const pb = await getPb();
	// Upsert behavior: try find existing mapping, else create.
	const filter = `guild_id = "${escapeFilterValue(guildId)}" && user_id = "${escapeFilterValue(userId)}"`;
	const list = await pb.collection(ACTIVE_COLLECTION).getList(1, 1, { filter });

	// Clearing active character: delete the mapping if it exists.
	if (!characterId) {
		if (list.items.length) {
			await pb.collection(ACTIVE_COLLECTION).delete(list.items[0].id);
		}
		return { cleared: true };
	}

	if (list.items.length) {
		return pb.collection(ACTIVE_COLLECTION).update(list.items[0].id, { character_id: characterId });
	}
	return pb.collection(ACTIVE_COLLECTION).create({ guild_id: guildId, user_id: userId, character_id: characterId });
}

async function getActiveCharacterId({ guildId, userId }) {
	const pb = await getPb();
	const filter = `guild_id = "${escapeFilterValue(guildId)}" && user_id = "${escapeFilterValue(userId)}"`;
	const list = await pb.collection(ACTIVE_COLLECTION).getList(1, 1, { filter });
	if (!list.items.length) return null;
	return list.items[0].character_id;
}

module.exports = {
	createCharacter,
	listCharacters,
	getCharacterById,
	findCharactersByName,
	deleteCharacter,
	renameCharacter,
	updateCharacter,
	setActiveCharacter,
	getActiveCharacterId,
};
