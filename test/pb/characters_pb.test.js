const test = require('node:test');
const assert = require('node:assert/strict');

const pbMod = require('../../lib/pb');

function loadCharactersPbFresh() {
	delete require.cache[require.resolve('../../lib/characters_pb')];
	return require('../../lib/characters_pb');
}

function makePb() {
	const calls = [];

	const activeItems = [];
	const collections = new Map();

	function ensureCollection(name) {
		if (collections.has(name)) return collections.get(name);
		const colCalls = [];
		const col = {
			_calls: colCalls,
			getFullList: async (opts) => { colCalls.push(['getFullList', opts]); return []; },
			getOne: async (id) => { colCalls.push(['getOne', id]); throw Object.assign(new Error('not implemented'), { status: 500 }); },
			getList: async (page, perPage, opts) => { colCalls.push(['getList', page, perPage, opts]); return { items: [] }; },
			create: async (data) => { colCalls.push(['create', data]); return { id: 'new', ...data }; },
			update: async (id, data) => { colCalls.push(['update', id, data]); return { id, ...data }; },
			delete: async (id) => { colCalls.push(['delete', id]); return true; },
		};
		collections.set(name, col);
		return col;
	}

	const pb = {
		collection: (name) => {
			calls.push(['collection', name]);
			const col = ensureCollection(name);

			// Provide a default ACTIVE_COLLECTION behavior we can control.
			if (name === (process.env.PB_ACTIVE_COLLECTION || 'rhune_user_active_character')) {
				return {
					...col,
					getList: async (page, perPage, opts) => {
						col._calls.push(['getList', page, perPage, opts]);
						return { items: [...activeItems] };
					},
					create: async (data) => {
						col._calls.push(['create', data]);
						const rec = { id: 'active1', ...data };
						activeItems.splice(0, activeItems.length, rec);
						return rec;
					},
					update: async (id, data) => {
						col._calls.push(['update', id, data]);
						activeItems[0] = { ...activeItems[0], ...data };
						return activeItems[0];
					},
					delete: async (id) => {
						col._calls.push(['delete', id]);
						activeItems.splice(0, activeItems.length);
						return true;
					},
				};
			}

			return col;
		},
		_calls: calls,
		_collections: collections,
		_activeItems: activeItems,
	};

	return pb;
}

function stubRunPb(pb) {
	const orig = pbMod.runPb;
	pbMod.runPb = async (fn) => fn(pb);
	return () => { pbMod.runPb = orig; };
}

function withStubbedRunPb(pb) {
	const restore = stubRunPb(pb);
	const characters = loadCharactersPbFresh();
	return { characters, restore };
}

test('characters_pb.createCharacter: defaults xp/load fields to 0 when null/undefined', async () => {
	const pb = makePb();
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		const rec = await characters.createCharacter({
			guildId: 'g1',
			ownerUserId: 'u1',
			name: 'Korina',
			xp: null,
			loadCurrent: undefined,
			loadMax: null,
		});
		assert.equal(rec.guild_id, 'g1');
		assert.equal(rec.owner_user_id, 'u1');
		assert.equal(rec.name, 'Korina');
		assert.equal(rec.xp, 0);
		assert.equal(rec.load_current, 0);
		assert.equal(rec.load_max, 0);
	}
	finally { restore(); }
});

test('characters_pb.listCharacters: guild scoping only', async () => {
	const pb = makePb();
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		await characters.listCharacters({ guildId: 'g1' });
		const col = pb._collections.get(process.env.PB_CHARACTERS_COLLECTION || 'rhune_characters');
		const call = col._calls.find(c => c[0] === 'getFullList');
		assert.ok(call, 'expected getFullList call');
		assert.equal(call[1].sort, 'name');
		assert.match(call[1].filter, /guild_id\s*=\s*"g1"/);
		assert.doesNotMatch(call[1].filter, /owner_user_id/);
	}
	finally { restore(); }
});

test('characters_pb.listCharacters: guild + owner scoping', async () => {
	const pb = makePb();
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		await characters.listCharacters({ guildId: 'g1', ownerUserId: 'u1' });
		const col = pb._collections.get(process.env.PB_CHARACTERS_COLLECTION || 'rhune_characters');
		const call = col._calls.find(c => c[0] === 'getFullList');
		assert.match(call[1].filter, /guild_id\s*=\s*"g1"/);
		assert.match(call[1].filter, /owner_user_id\s*=\s*"u1"/);
		assert.match(call[1].filter, /&&/);
	}
	finally { restore(); }
});

test('characters_pb.getCharacterById: returns null on cross-guild id (fail-closed)', async () => {
	const pb = makePb();
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		const col = pb._collections.get(process.env.PB_CHARACTERS_COLLECTION || 'rhune_characters') || pb.collection(process.env.PB_CHARACTERS_COLLECTION || 'rhune_characters');
		col.getOne = async (id) => ({ id, guild_id: 'g2', owner_user_id: 'u1', name: 'X' });

		const rec = await characters.getCharacterById({ id: 'c1', guildId: 'g1' });
		assert.equal(rec, null);
	}
	finally { restore(); }
});

test('characters_pb.setActiveCharacter: creates mapping when none exists', async () => {
	const pb = makePb();
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		const res = await characters.setActiveCharacter({ guildId: 'g1', userId: 'u1', characterId: 'c1' });
		assert.equal(res.character_id, 'c1');
		assert.equal(pb._activeItems[0].character_id, 'c1');
	}
	finally { restore(); }
});

test('characters_pb.setActiveCharacter: updates mapping when exists', async () => {
	const pb = makePb();
	pb._activeItems.push({ id: 'active1', guild_id: 'g1', user_id: 'u1', character_id: 'c1' });
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		const res = await characters.setActiveCharacter({ guildId: 'g1', userId: 'u1', characterId: 'c2' });
		assert.equal(res.character_id, 'c2');
		assert.equal(pb._activeItems[0].character_id, 'c2');
	}
	finally { restore(); }
});

test('characters_pb.setActiveCharacter: clears mapping when characterId is null', async () => {
	const pb = makePb();
	pb._activeItems.push({ id: 'active1', guild_id: 'g1', user_id: 'u1', character_id: 'c1' });
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		const res = await characters.setActiveCharacter({ guildId: 'g1', userId: 'u1', characterId: null });
		assert.deepEqual(res, { cleared: true });
		assert.equal(pb._activeItems.length, 0);
	}
	finally { restore(); }
});

test('characters_pb.getActiveCharacterId: returns null when no mapping', async () => {
	const pb = makePb();
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		const id = await characters.getActiveCharacterId({ guildId: 'g1', userId: 'u1' });
		assert.equal(id, null);
	}
	finally { restore(); }
});

test('characters_pb.getActiveCharacterId: returns character_id when mapping exists', async () => {
	const pb = makePb();
	pb._activeItems.push({ id: 'active1', guild_id: 'g1', user_id: 'u1', character_id: 'c1' });
	const { characters, restore } = withStubbedRunPb(pb);
	try {
		const id = await characters.getActiveCharacterId({ guildId: 'g1', userId: 'u1' });
		assert.equal(id, 'c1');
	}
	finally { restore(); }
});
