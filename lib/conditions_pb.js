const { runPb } = require('./pb');
const { escapeFilterValue } = require('./format');

const COLLECTION = process.env.PB_CONDITIONS_COLLECTION || 'rhune_character_conditions';

// Conditions belong to a character (which belongs to a guild). These are
// operated on by characterId, which callers resolve guild-safely first.

async function listConditions({ characterId }) {
	return runPb(async pb => {
		const filter = `character_id = "${escapeFilterValue(characterId)}"`;
		return pb.collection(COLLECTION).getFullList({ sort: 'name', filter });
	});
}

async function addCondition({ characterId, name }) {
	return runPb(pb => pb.collection(COLLECTION).create({ character_id: characterId, name }));
}

async function removeCondition({ characterId, name }) {
	return runPb(async pb => {
		const filter = `character_id = "${escapeFilterValue(characterId)}" && name = "${escapeFilterValue(name)}"`;
		const list = await pb.collection(COLLECTION).getList(1, 50, { filter });
		for (const row of list.items) {
			// remove all duplicates
			await pb.collection(COLLECTION).delete(row.id);
		}
		return { deleted: list.items.length };
	});
}

module.exports = {
	listConditions,
	addCondition,
	removeCondition,
};
