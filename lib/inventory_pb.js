const { getPb } = require('./pb');
const { escapeFilterValue } = require('./format');

const COLLECTION = process.env.PB_INVENTORY_COLLECTION || 'rhune_inventory_items';

async function listInventory({ characterId }) {
	const pb = await getPb();
	const filter = `character_id = "${escapeFilterValue(characterId)}"`;
	return pb.collection(COLLECTION).getFullList({ sort: 'name', filter });
}

async function addInventoryItem({ characterId, name, qty = 1, notes = null }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).create({ character_id: characterId, name, qty, notes });
}

async function getInventoryItemById({ id }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).getOne(id);
}

async function updateInventoryItem({ id, patch }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).update(id, patch);
}

async function deleteInventoryItem({ id }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).delete(id);
}

module.exports = {
	listInventory,
	addInventoryItem,
	getInventoryItemById,
	updateInventoryItem,
	deleteInventoryItem,
};
