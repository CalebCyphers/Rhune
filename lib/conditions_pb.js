const { getPb } = require('./pb');
const { escapeFilterValue } = require('./format');

const COLLECTION = process.env.PB_CONDITIONS_COLLECTION || 'rhune_character_conditions';

async function listConditions({ characterId }) {
	const pb = await getPb();
	const filter = `character_id = "${escapeFilterValue(characterId)}"`;
	return pb.collection(COLLECTION).getFullList({ sort: 'name', filter });
}

async function addCondition({ characterId, name }) {
	const pb = await getPb();
	return pb.collection(COLLECTION).create({ character_id: characterId, name });
}

async function removeCondition({ characterId, name }) {
	const pb = await getPb();
	const filter = `character_id = "${escapeFilterValue(characterId)}" && name = "${escapeFilterValue(name)}"`;
	const list = await pb.collection(COLLECTION).getList(1, 50, { filter });
	for (const row of list.items) {
		// remove all duplicates
		await pb.collection(COLLECTION).delete(row.id);
	}
	return { deleted: list.items.length };
}

module.exports = {
	listConditions,
	addCondition,
	removeCondition,
};
