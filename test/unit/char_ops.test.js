const test = require('node:test');
const assert = require('node:assert/strict');

// Confirm tests for lib/char_ops.doCharAction authorization.
//
// A11 (GM-denied bug): the pickchar/disambiguation handler in index.js already
// computes isGm = isGuildOwner(...) and passes that gate, but then calls
// doCharAction with guildOwnerId = interaction.guild?.ownerId ?? null. In the
// partial-guild environment ownerId is often undefined -> null, so doCharAction
// re-derives isGM = (null === userId) = false and DENIES the GM even though they
// are allowed. The fix: pass the resolved isGM flag into doCharAction.
//
// These tests assert the DESIRED contract. Test 'A11' fails against the current
// buggy code (no isGM param) and passes after the fix.

function loadCharOpsFresh() {
	delete require.cache[require.resolve('../../lib/char_ops')];
	return require('../../lib/char_ops');
}

function makeRecord(overrides = {}) {
	return {
		id: 'c1',
		guild_id: 'g1',
		owner_user_id: 'u1',
		name: 'Korina',
		stats: { str: 1, dex: 0, con: 0, int: 1, wis: 0, cha: 0 },
		hp: 10,
		hp_max: 16,
		xp: 2,
		...overrides,
	};
}

// Stub the PB wrapper modules that char_ops depends on.
function stubPbModules(pbState) {
	const charactersPb = require('../../lib/characters_pb');
	const conditionsPb = require('../../lib/conditions_pb');

	const calls = {
		update: [],
		rename: [],
		remove: [],
		addCondition: [],
		removeCondition: [],
	};

	const orig = {
		getCharacterById: charactersPb.getCharacterById,
		setActiveCharacter: charactersPb.setActiveCharacter,
		updateCharacter: charactersPb.updateCharacter,
		renameCharacter: charactersPb.renameCharacter,
		deleteCharacter: charactersPb.deleteCharacter,
		addCondition: conditionsPb.addCondition,
		removeCondition: conditionsPb.removeCondition,
	};

	charactersPb.getCharacterById = async () => pbState.record || null;
	charactersPb.setActiveCharacter = async ({ characterId }) => {
		calls.setActive = characterId;
		return { id: 'x', character_id: characterId };
	};
	charactersPb.updateCharacter = async ({ id, patch }) => {
		calls.update.push({ id, patch });
		const updated = { ...pbState.record, ...patch };
		if (patch.stats) updated.stats = { ...(pbState.record.stats || {}), ...patch.stats };
		pbState.record = updated;
		return updated;
	};
	charactersPb.renameCharacter = async ({ id, newName }) => {
		calls.rename.push({ id, newName });
		pbState.record = { ...pbState.record, name: newName };
		return pbState.record;
	};
	charactersPb.deleteCharacter = async ({ id: charId }) => {
		calls.deleted = charId;
		return true;
	};
	conditionsPb.addCondition = async ({ characterId, name }) => {
		calls.addCondition.push({ characterId, name });
		return { id: 'cond', character_id: characterId, name };
	};
	conditionsPb.removeCondition = async ({ characterId, name }) => {
		calls.removeCondition.push({ characterId, name });
		return { deleted: 1 };
	};

	return {
		calls,
		restore() {
			charactersPb.getCharacterById = orig.getCharacterById;
			charactersPb.setActiveCharacter = orig.setActiveCharacter;
			charactersPb.updateCharacter = orig.updateCharacter;
			charactersPb.renameCharacter = orig.renameCharacter;
			charactersPb.deleteCharacter = orig.deleteCharacter;
			conditionsPb.addCondition = orig.addCondition;
			conditionsPb.removeCondition = orig.removeCondition;
		},
	};
}

test('A11: GM acting on another owner\'s character is allowed when isGM flag is passed (ownerId unreliable)', async () => {
	const pbState = { record: makeRecord({ owner_user_id: 'u1' }) };
	const pb = stubPbModules(pbState);
	const { doCharAction } = loadCharOpsFresh();
	try {
		// GM is 'gm'; character belongs to 'u1'; guild ownerId resolves to null in the
		// partial-guild env, so legacy guildOwnerId is null — but isGM true is correct.
		const result = await doCharAction({
			action: 'set',
			guildId: 'g1',
			userId: 'gm',
			charId: 'c1',
			payload: { patch: { xp: 3 } },
			isGM: true,
		});
		assert.equal(result.type, 'record');
		assert.equal(pbState.record.xp, 3);
	}
	finally { restorePb(pb); }
});

test('non-owner (and not GM) is denied: set throws', async () => {
	const pbState = { record: makeRecord({ owner_user_id: 'u1' }) };
	const pb = stubPbModules(pbState);
	const { doCharAction } = loadCharOpsFresh();
	try {
		await assert.rejects(
			doCharAction({
				action: 'set',
				guildId: 'g1',
				userId: 'intruder',
				charId: 'c1',
				payload: { patch: { xp: 3 } },
			}),
			/You do not own that character/,
		);
	}
	finally { restorePb(pb); }
});

test('owner acting on own character is allowed (no isGM needed)', async () => {
	const pbState = { record: makeRecord({ owner_user_id: 'u1' }) };
	const pb = stubPbModules(pbState);
	const { doCharAction } = loadCharOpsFresh();
	try {
		const result = await doCharAction({
			action: 'set',
			guildId: 'g1',
			userId: 'u1',
			charId: 'c1',
			payload: { patch: { xp: 9 } },
		});
		assert.equal(result.type, 'record');
		assert.equal(pbState.record.xp, 9);
	}
	finally { restorePb(pb); }
});

test('cross-guild character is rejected regardless of owner/GM', async () => {
	const pbState = { record: makeRecord({ guild_id: 'g2', owner_user_id: 'u1' }) };
	const pb = stubPbModules(pbState);
	const { doCharAction } = loadCharOpsFresh();
	try {
		await assert.rejects(
			doCharAction({
				action: 'set',
				guildId: 'g1',
				userId: 'u1',
				charId: 'c1',
				payload: { patch: { xp: 1 } },
				isGM: true,
			}),
			/not from this server/,
		);
	}
	finally { restorePb(pb); }
});

test('GM legacy path still works: guildOwnerId passed as owner id allows GM action', async () => {
	const pbState = { record: makeRecord({ owner_user_id: 'u1' }) };
	const pb = stubPbModules(pbState);
	const { doCharAction } = loadCharOpsFresh();
	try {
		const result = await doCharAction({
			action: 'set',
			guildId: 'g1',
			userId: 'gm',
			charId: 'c1',
			payload: { patch: { xp: 5 } },
			guildOwnerId: 'gm',
		});
		assert.equal(result.type, 'record');
		assert.equal(pbState.record.xp, 5);
	}
	finally { restorePb(pb); }
});

function restorePb(pb) {
	pb.restore();
	loadCharOpsFresh();
}
