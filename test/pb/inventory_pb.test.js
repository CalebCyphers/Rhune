const test = require('node:test');
const assert = require('node:assert/strict');

// Purpose: contract tests for lib/inventory_pb.js.
// We mock PocketBase via stubbed runPb() and (when needed) stub characters_pb.getCharacterById
// to verify inventory scoping rules and to ensure guildId-based calls fail closed.
const pbMod = require('../../lib/pb');

function loadInventoryPbFresh() {
	delete require.cache[require.resolve('../../lib/inventory_pb')];
	return require('../../lib/inventory_pb');
}

function makePb() {
	const collections = new Map();
	function ensureCollection(name) {
		if (collections.has(name)) return collections.get(name);
		const calls = [];
		const col = {
			_calls: calls,
			getFullList: async (opts) => { calls.push(['getFullList', opts]); return []; },
			getOne: async (id) => { calls.push(['getOne', id]); return { id, character_id: 'char1', name: 'Rope', qty: 1, notes: null }; },
			create: async (data) => { calls.push(['create', data]); return { id: 'item_new', ...data }; },
			update: async (id, data) => { calls.push(['update', id, data]); return { id, ...data }; },
			delete: async (id) => { calls.push(['delete', id]); return true; },
		};
		collections.set(name, col);
		return col;
	}
	return {
		_collections: collections,
		collection: (name) => ensureCollection(name),
	};
}

function stubRunPb(pb) {
	const orig = pbMod.runPb;
	pbMod.runPb = async (fn) => fn(pb);
	return () => { pbMod.runPb = orig; };
}

function stubRequire(id, exportsObj) {
	const resolved = require.resolve(id);
	const prev = require.cache[resolved];
	require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
	return () => {
		if (prev) require.cache[resolved] = prev;
		else delete require.cache[resolved];
	};
}

test('inventory_pb.listInventory: uses character_id filter + sorts by name', async () => {
	const pb = makePb();
	const restoreRun = stubRunPb(pb);
	try {
		const inventory = loadInventoryPbFresh();
		await inventory.listInventory({ characterId: 'char1' });
		const col = pb._collections.get(process.env.PB_INVENTORY_COLLECTION || 'rhune_inventory_items');
		const call = col._calls.find(c => c[0] === 'getFullList');
		assert.ok(call);
		assert.equal(call[1].sort, 'name');
		assert.match(call[1].filter, /character_id\s*=\s*"char1"/);
	}
	finally { restoreRun(); }
});

test('inventory_pb.getInventoryItemById: with guildId returns null when character not in guild (fail-closed)', async () => {
	const pb = makePb();
	const restoreRun = stubRunPb(pb);
	const restoreChars = stubRequire('../../lib/characters_pb', {
		getCharacterById: async () => null,
	});
	try {
		const inventory = loadInventoryPbFresh();
		const item = await inventory.getInventoryItemById({ id: 'item1', guildId: 'g1' });
		assert.equal(item, null);
	}
	finally {
		restoreChars();
		restoreRun();
	}
});

test('inventory_pb.updateInventoryItem: with guildId returns null and does not update if fail-closed', async () => {
	const pb = makePb();
	const restoreRun = stubRunPb(pb);
	const restoreChars = stubRequire('../../lib/characters_pb', {
		getCharacterById: async () => null,
	});
	try {
		const inventory = loadInventoryPbFresh();
		const res = await inventory.updateInventoryItem({ id: 'item1', patch: { qty: 2 }, guildId: 'g1' });
		assert.equal(res, null);
		const col = pb._collections.get(process.env.PB_INVENTORY_COLLECTION || 'rhune_inventory_items');
		assert.ok(!col._calls.find(c => c[0] === 'update'), 'expected no update call');
	}
	finally {
		restoreChars();
		restoreRun();
	}
});

test('inventory_pb.deleteInventoryItem: with guildId returns null and does not delete if fail-closed', async () => {
	const pb = makePb();
	const restoreRun = stubRunPb(pb);
	const restoreChars = stubRequire('../../lib/characters_pb', {
		getCharacterById: async () => null,
	});
	try {
		const inventory = loadInventoryPbFresh();
		const res = await inventory.deleteInventoryItem({ id: 'item1', guildId: 'g1' });
		assert.equal(res, null);
		const col = pb._collections.get(process.env.PB_INVENTORY_COLLECTION || 'rhune_inventory_items');
		assert.ok(!col._calls.find(c => c[0] === 'delete'), 'expected no delete call');
	}
	finally {
		restoreChars();
		restoreRun();
	}
});
