const { runPb } = require('./pb');
const { escapeFilterValue } = require('./format');

// Freeform character notes.
//
// These reuse the original inventory-state collection + text field so any note
// a player already saved under the old /outfit flow carries straight over as
// their notes — no migration, no data loss. Only the vocabulary changed.
const COLLECTION = process.env.PB_INVENTORY_STATE_COLLECTION || 'rhune_inventory_state';
const TEXT_FIELD = 'inventory_text';

/** Raw notes-state record for a character, or null. */
async function getNotesState({ characterId, guildId = null }) {
	return runPb(async pb => {
		const filter = `character_id = "${escapeFilterValue(characterId)}"`;
		const list = await pb.collection(COLLECTION).getList(1, 1, { filter });
		if (!list.items.length) return null;
		const rec = list.items[0];
		if (guildId && rec.guild_id !== guildId) return null;
		return rec;
	});
}

/** Notes text for a character, or null when unset/blank. */
async function getNotesText({ characterId, guildId = null }) {
	const rec = await getNotesState({ characterId, guildId });
	const text = rec?.[TEXT_FIELD] ? String(rec[TEXT_FIELD]) : null;
	return text && text.trim().length ? text : null;
}

/** Create or update a character's notes. */
async function upsertNotes({ characterId, guildId, text, updatedByUserId = null }) {
	return runPb(async pb => {
		const filter = `character_id = "${escapeFilterValue(characterId)}"`;
		const list = await pb.collection(COLLECTION).getList(1, 1, { filter });

		const payload = {
			character_id: characterId,
			guild_id: guildId,
			[TEXT_FIELD]: text,
		};
		if (updatedByUserId) payload.updated_by_user_id = updatedByUserId;

		if (list.items.length) {
			return pb.collection(COLLECTION).update(list.items[0].id, payload);
		}
		return pb.collection(COLLECTION).create(payload);
	});
}

module.exports = {
	getNotesState,
	getNotesText,
	upsertNotes,
};
