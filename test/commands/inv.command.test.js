const test = require('node:test');
const assert = require('node:assert/strict');

const { makeInteraction } = require('../helpers');

function stubRequire(id, exportsObj) {
	const resolved = require.resolve(id);
	const prev = require.cache[resolved];
	require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports: exportsObj };
	return () => {
		if (prev) require.cache[resolved] = prev;
		else delete require.cache[resolved];
	};
}

async function loadInvCommandWithStubs(stubs) {
	const restores = [];
	restores.push(stubRequire('../../lib/characters_pb', stubs.characters_pb));
	restores.push(stubRequire('../../lib/inventory_pb', stubs.inventory_pb));
	restores.push(stubRequire('../../lib/interaction_helpers', stubs.interaction_helpers));

	delete require.cache[require.resolve('../../commands/inv')];
	const mod = require('../../commands/inv');
	return {
		invCmd: mod,
		restoreAll: () => restores.reverse().forEach(fn => fn()),
	};
}

function makeStubs(overrides = {}) {
	const calls = {
		replyEphemeral: [],
		requireGuild: [],
		getCharacterById: [],
		getActiveCharacterId: [],
		listInventory: [],
		addInventoryItem: [],
		getInventoryItemById: [],
		updateInventoryItem: [],
		deleteInventoryItem: [],
	};

	const stubs = {
		calls,
		interaction_helpers: {
			requireGuild: (interaction) => { calls.requireGuild.push({ guildId: interaction.guildId }); if (!interaction.guildId) throw new Error('no guild'); },
			replyEphemeral: async (interaction, content) => { calls.replyEphemeral.push({ content }); return { content, ephemeral: true }; },
		},
		characters_pb: {
			getCharacterById: async (args) => { calls.getCharacterById.push(args); return overrides.getCharacterById?.(args) ?? null; },
			getActiveCharacterId: async (args) => { calls.getActiveCharacterId.push(args); return overrides.getActiveCharacterId?.(args) ?? null; },
		},
		inventory_pb: {
			listInventory: async (args) => { calls.listInventory.push(args); return overrides.listInventory?.(args) ?? []; },
			addInventoryItem: async (args) => { calls.addInventoryItem.push(args); return overrides.addInventoryItem?.(args) ?? { id: 'item1', name: args.name, qty: args.qty, notes: args.notes, character_id: args.characterId }; },
			getInventoryItemById: async (args) => { calls.getInventoryItemById.push(args); return overrides.getInventoryItemById?.(args) ?? null; },
			updateInventoryItem: async (args) => { calls.updateInventoryItem.push(args); return overrides.updateInventoryItem?.(args) ?? { id: args.id, ...args.patch }; },
			deleteInventoryItem: async (args) => { calls.deleteInventoryItem.push(args); return overrides.deleteInventoryItem?.(args) ?? true; },
		},
	};

	return stubs;
}

test('inv set: item id not found -> clean error (no crash)', async () => {
	const stubs = makeStubs({
		getInventoryItemById: () => null,
	});
	const { invCmd, restoreAll } = await loadInvCommandWithStubs(stubs);
	try {
		const { interaction } = makeInteraction({ subcommand: 'set', options: { item_id: 'missing', qty: 2 } });
		await invCmd.execute(interaction);
		assert.equal(stubs.calls.replyEphemeral.length, 1);
		assert.match(stubs.calls.replyEphemeral[0].content, /not found|could not find/i);
	}
	finally { restoreAll(); }
});
