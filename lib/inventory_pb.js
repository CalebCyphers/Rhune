const { runPb } = require('./pb');
const { escapeFilterValue } = require('./format');

const COLLECTION = process.env.PB_INVENTORY_COLLECTION || 'rhune_inventory_items';

// Inventory items belong to a character, which belongs to a guild. Id-based
// operations are guild-scoped (fail-closed) so a stray item id can't be
// read or mutated across servers in the shared PocketBase (Option 1).

async function listInventory({ characterId }) {
	return runPb(async pb => {
		const filter = `character_id = "${escapeFilterValue(characterId)}"`;
		return pb.collection(COLLECTION).getFullList({ sort: 'name', filter });
	});
}

async function addInventoryItem({ characterId, name, qty = 1, notes = null }) {
	return runPb(pb => pb.collection(COLLECTION).create({ character_id: characterId, name, qty, notes }));
}

/**
 * Fetch an inventory item by id. If a `guildId` is supplied (recommended), the
 * item is verified to belong to a character in that guild and `null` is
 * returned otherwise (fail-closed against cross-guild access).
 */
async function getInventoryItemById({ id, guildId = null }) {
	const item = await runPb(pb => pb.collection(COLLECTION).getOne(id));
	if (guildId) {
		const { getCharacterById } = require('./characters_pb');
		const character = await getCharacterById({ id: item.character_id, guildId });
		if (!character) return null;
	}
	return item;
}

async function updateInventoryItem({ id, patch, guildId = null }) {
	if (guildId) {
		const item = await getInventoryItemById({ id, guildId });
		if (!item) return null;
	}
	return runPb(pb => pb.collection(COLLECTION).update(id, patch));
}

async function deleteInventoryItem({ id, guildId = null }) {
	if (guildId) {
		const item = await getInventoryItemById({ id, guildId });
		if (!item) return null;
	}
	return runPb(pb => pb.collection(COLLECTION).delete(id));
}

module.exports = {
	listInventory,
	addInventoryItem,
	getInventoryItemById,
	updateInventoryItem,
	deleteInventoryItem,
};
