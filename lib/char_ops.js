const { getCharacterById, setActiveCharacter, updateCharacter, renameCharacter, deleteCharacter } = require('./characters_pb');
const { addCondition, removeCondition } = require('./conditions_pb');

async function doCharAction({ action, guildId, userId, charId, payload }) {
	const record = await getCharacterById({ id: charId });
	if (record.guild_id !== guildId) throw new Error('That character is not from this server.');
	if (record.owner_user_id !== userId) throw new Error('You do not own that character.');

	if (action === 'active') {
		await setActiveCharacter({ guildId, userId, characterId: record.id });
		return { type: 'text', content: `Set active character to **${record.name}** (\`${record.id}\`).` };
	}

	if (action === 'sheet') {
		return { type: 'record', record };
	}

	if (action === 'rename') {
		const newName = payload?.newName;
		if (!newName) throw new Error('Missing new name.');
		await renameCharacter({ id: record.id, newName });
		return { type: 'text', content: `Renamed character to **${newName}**.` };
	}

	if (action === 'delete') {
		// NOTE: active mapping cleanup is handled in /char delete handler; here we only delete the record.
		await deleteCharacter({ id: record.id });
		return { type: 'text', content: `Deleted character **${record.name}**.` };
	}

	if (action === 'set') {
		const patch = payload?.patch;
		if (!patch || !Object.keys(patch).length) throw new Error('Nothing to set.');
		const updated = await updateCharacter({ id: record.id, patch: patch.stats ? { ...patch, stats: { ...(record.stats || {}), ...(patch.stats || {}) } } : patch });
		return { type: 'record', record: updated };
	}

	if (action === 'mod') {
		const deltas = payload?.deltas || {};
		const patch = {};
		for (const field of ['hp', 'hp_max', 'xp', 'load_current', 'load_max']) {
			const delta = deltas[field];
			if (delta === null || delta === undefined) continue;
			patch[field] = Number(record[field] ?? 0) + Number(delta);
		}
		const updated = await updateCharacter({ id: record.id, patch });
		return { type: 'record', record: updated };
	}

	if (action === 'cond_add') {
		const name = payload?.name;
		if (!name) throw new Error('Missing condition name.');
		await addCondition({ characterId: record.id, name });
		return { type: 'record', record: await getCharacterById({ id: record.id }) };
	}

	if (action === 'cond_remove') {
		const name = payload?.name;
		if (!name) throw new Error('Missing condition name.');
		await removeCondition({ characterId: record.id, name });
		return { type: 'record', record: await getCharacterById({ id: record.id }) };
	}

	throw new Error('Unknown action.');
}

module.exports = { doCharAction };
