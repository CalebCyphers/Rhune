const { runPb } = require('./pb');
const { escapeFilterValue } = require('./format');

const COLLECTION = process.env.PB_INVENTORY_STATE_COLLECTION || 'rhune_inventory_state';

async function getInventoryState({ characterId, guildId = null }) {
	return runPb(async pb => {
		const filter = `character_id = "${escapeFilterValue(characterId)}"`;
		const list = await pb.collection(COLLECTION).getList(1, 1, { filter });
		if (!list.items.length) return null;
		const rec = list.items[0];
		if (guildId && rec.guild_id !== guildId) return null;
		return rec;
	});
}

async function upsertInventoryState({ characterId, guildId, inventoryText, updatedByUserId = null }) {
	return runPb(async pb => {
		const filter = `character_id = "${escapeFilterValue(characterId)}"`;
		const list = await pb.collection(COLLECTION).getList(1, 1, { filter });

		const payload = {
			character_id: characterId,
			guild_id: guildId,
			inventory_text: inventoryText,
		};
		if (updatedByUserId) payload.updated_by_user_id = updatedByUserId;

		if (list.items.length) {
			return pb.collection(COLLECTION).update(list.items[0].id, payload);
		}
		return pb.collection(COLLECTION).create(payload);
	});
}

module.exports = {
	getInventoryState,
	upsertInventoryState,
};
