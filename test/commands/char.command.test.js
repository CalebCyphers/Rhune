const test = require('node:test');
const assert = require('node:assert/strict');

const { makeInteraction, assertRepliedEphemeral } = require('../helpers');

function makeStubs(overrides = {}) {
	const calls = {
		listCharacters: [],
		getCharacterById: [],
		setActiveCharacter: [],
		getActiveCharacterId: [],
		updateCharacter: [],
		renameCharacter: [],
		deleteCharacter: [],
		renderCharacterSheetEmbed: [],
		lookupPlaybook: [],
		resolveCharacterTarget: [],
		setPending: [],
		disambiguationMessage: [],
		isGuildOwner: [],
	};

	const stubs = {
		calls,
		characters_pb: {
			listCharacters: async (args) => { calls.listCharacters.push(args); return overrides.listCharacters?.(args) ?? []; },
			getCharacterById: async (args) => { calls.getCharacterById.push(args); return overrides.getCharacterById?.(args) ?? null; },
			setActiveCharacter: async (args) => { calls.setActiveCharacter.push(args); return overrides.setActiveCharacter?.(args) ?? { id: 'active1', ...args }; },
			getActiveCharacterId: async (args) => { calls.getActiveCharacterId.push(args); return overrides.getActiveCharacterId?.(args) ?? null; },
			updateCharacter: async (args) => { calls.updateCharacter.push(args); return overrides.updateCharacter?.(args) ?? { id: args.id, guild_id: 'guild1', owner_user_id: 'user1', stats: {}, ...args.patch }; },
			renameCharacter: async (args) => { calls.renameCharacter.push(args); return overrides.renameCharacter?.(args) ?? { id: args.id, name: args.newName }; },
			deleteCharacter: async (args) => { calls.deleteCharacter.push(args); return overrides.deleteCharacter?.(args) ?? true; },
		},
		character_embed: {
			renderCharacterSheetEmbed: async (record) => { calls.renderCharacterSheetEmbed.push(record); return { title: `sheet:${record.name}` }; },
		},
		playbooks: {
			lookupPlaybook: (key) => { calls.lookupPlaybook.push(key); return overrides.lookupPlaybook?.(key) ?? null; },
		},
		resolve_target: {
			resolveCharacterTarget: async (args) => { calls.resolveCharacterTarget.push(args); return overrides.resolveCharacterTarget?.(args) ?? { kind: 'none', target: args.target }; },
		},
		disambiguation: {
			disambiguationMessage: (args) => { calls.disambiguationMessage.push(args); return { content: `ambiguous:${args.action}` , ephemeral: true }; },
		},
		pending_actions: {
			setPending: (userId, payload) => { calls.setPending.push({ userId, payload }); },
		},
		gm: {
			isGuildOwner: async (interaction, userId) => { calls.isGuildOwner.push({ guildId: interaction.guildId, userId }); return overrides.isGuildOwner?.(interaction, userId) ?? false; },
		},
	};

	return stubs;
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

async function loadCharCommandWithStubs(stubs) {
	const restores = [];
	restores.push(stubRequire('../../lib/characters_pb', stubs.characters_pb));
	restores.push(stubRequire('../../lib/character_embed', stubs.character_embed));
	restores.push(stubRequire('../../lib/playbooks', stubs.playbooks));
	restores.push(stubRequire('../../lib/resolve_target', stubs.resolve_target));
	restores.push(stubRequire('../../lib/disambiguation', stubs.disambiguation));
	restores.push(stubRequire('../../lib/pending_actions', stubs.pending_actions));
	restores.push(stubRequire('../../lib/gm', stubs.gm));

	// not used in these tests, but required by module
	restores.push(stubRequire('../../lib/create_wizard', {
		startWizard: () => {},
		getStepInfo: () => ({ type: 'playbook_picker', backgrounds: [], instincts: [], pool: [], poolKeys: [], stats: { str: null, dex: null, con: null, int: null, wis: null, cha: null }, allAssigned: false }),
		selectPlaybook: () => {},
	}));
	restores.push(stubRequire('../../lib/conditions_pb', { addCondition: async () => ({}), removeCondition: async () => ({ deleted: 0 }) }));

	delete require.cache[require.resolve('../../commands/char')];
	const mod = require('../../commands/char');
	return {
		charCmd: mod,
		restoreAll: () => restores.reverse().forEach(fn => fn()),
	};
}

test('char: blocks outside guild', async () => {
	const stubs = makeStubs();
	const { charCmd, restoreAll } = await loadCharCommandWithStubs(stubs);
	try {
		const { interaction, calls } = makeInteraction({ guildId: null, subcommand: 'list' });
		await charCmd.execute(interaction);
		assert.equal(calls.reply.length, 1);
		assertRepliedEphemeral(calls.reply[0]);
		assert.match(calls.reply[0].content, /only works inside a server/i);
	}
	finally { restoreAll(); }
});

test('char list: non-GM cannot list all', async () => {
	const stubs = makeStubs({
		isGuildOwner: () => false,
	});
	const { charCmd, restoreAll } = await loadCharCommandWithStubs(stubs);
	try {
		const { interaction, calls } = makeInteraction({ subcommand: 'list', options: { all: true } });
		await charCmd.execute(interaction);
		assert.equal(calls.reply.length, 1);
		assertRepliedEphemeral(calls.reply[0]);
		assert.match(calls.reply[0].content, /only the guild owner/i);
		assert.equal(stubs.calls.listCharacters.length, 0);
	}
	finally { restoreAll(); }
});

test('char list: GM can list all and sees owners + active marker', async () => {
	const stubs = makeStubs({
		isGuildOwner: () => true,
		listCharacters: () => ([
			{ id: 'c1', name: 'A', playbook: 'Seeker', owner_user_id: 'u2' },
			{ id: 'c2', name: 'B', playbook: null, owner_user_id: 'u3' },
		]),
		getActiveCharacterId: () => 'c2',
	});
	const { charCmd, restoreAll } = await loadCharCommandWithStubs(stubs);
	try {
		const { interaction, calls } = makeInteraction({ subcommand: 'list', options: { all: true } });
		await charCmd.execute(interaction);
		assert.equal(stubs.calls.listCharacters.length, 1);
		assert.deepEqual(stubs.calls.listCharacters[0], { guildId: 'guild1', ownerUserId: null });
		assert.equal(calls.reply.length, 1);
		assert.match(calls.reply[0].content, /<@u2>/);
		assert.match(calls.reply[0].content, /\(active\)/);
	}
	finally { restoreAll(); }
});

test('char active: ambiguous target -> sets pending and replies disambiguation', async () => {
	const stubs = makeStubs({
		resolveCharacterTarget: (args) => ({ kind: 'ambiguous', target: args.target, matches: [{ id: 'c1', name: 'A' }] }),
	});
	const { charCmd, restoreAll } = await loadCharCommandWithStubs(stubs);
	try {
		const { interaction, calls } = makeInteraction({ subcommand: 'active', options: { target: 'A' } });
		await charCmd.execute(interaction);
		assert.equal(stubs.calls.setPending.length, 1);
		assert.equal(stubs.calls.setPending[0].payload.action, 'active');
		assert.equal(calls.reply.length, 1);
		assert.match(calls.reply[0].content, /ambiguous:active/);
	}
	finally { restoreAll(); }
});

test('char active: ok target but owner mismatch -> blocked', async () => {
	const stubs = makeStubs({
		resolveCharacterTarget: () => ({ kind: 'ok', record: { id: 'c1', name: 'A', guild_id: 'guild1', owner_user_id: 'someoneElse' } }),
	});
	const { charCmd, restoreAll } = await loadCharCommandWithStubs(stubs);
	try {
		const { interaction, calls } = makeInteraction({ subcommand: 'active', options: { target: 'A' } });
		await charCmd.execute(interaction);
		assert.equal(calls.reply.length, 1);
		assert.match(calls.reply[0].content, /do not own/i);
		assert.equal(stubs.calls.setActiveCharacter.length, 0);
	}
	finally { restoreAll(); }
});

test('char delete: if deleting active, clears mapping first', async () => {
	const stubs = makeStubs({
		resolveCharacterTarget: () => ({ kind: 'ok', record: { id: 'c1', name: 'A', guild_id: 'guild1', owner_user_id: 'user1' } }),
		getActiveCharacterId: () => 'c1',
	});
	const { charCmd, restoreAll } = await loadCharCommandWithStubs(stubs);
	try {
		const { interaction, calls } = makeInteraction({ subcommand: 'delete', options: { target: 'A' } });
		await charCmd.execute(interaction);
		assert.equal(stubs.calls.setActiveCharacter.length, 1);
		assert.deepEqual(stubs.calls.setActiveCharacter[0], { guildId: 'guild1', userId: 'user1', characterId: null });
		assert.equal(stubs.calls.deleteCharacter.length, 1);
		assert.equal(calls.reply.length, 1);
		assert.match(calls.reply[0].content, /Deleted character/i);
	}
	finally { restoreAll(); }
});
