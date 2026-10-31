const assert = require('node:assert/strict');

// Purpose: small test helpers shared across command tests.
// - makeInteraction(): creates a minimal discord.js-ish interaction stub + captures reply calls.
//   It also models the real deferred/replied lifecycle: deferReply()/deferUpdate()
//   flip `deferred`, reply()/update() flip `replied`. That lets handlers that
//   ack-first (defer) then editReply() be tested the same way as direct repliers.
// - assertRepliedEphemeral(): ensures a reply payload is ephemeral (ephemeral:true or flags:64).
// - responseOf()/assertEphemeralAck(): helpers that look across reply/editReply and
//   accept a preceding deferReply({flags:64}) as an ephemeral ack.
function makeInteraction({
	guildId = 'guild1',
	userId = 'user1',
	subcommand = 'list',
	subcommandGroup = null,
	options = {},
} = {}) {
	const calls = {
		reply: [],
		deferReply: [],
		editReply: [],
		followUp: [],
		update: [],
		deferUpdate: [],
	};

	const state = { deferred: false, replied: false };

	function getOpt(name) {
		return Object.prototype.hasOwnProperty.call(options, name) ? options[name] : null;
	}

	const interaction = {
		guildId,
		user: { id: userId },
		get deferred() { return state.deferred; },
		get replied() { return state.replied; },
		options: {
			getSubcommandGroup: () => subcommandGroup,
			getSubcommand: () => subcommand,
			getString: (name) => {
				const v = getOpt(name);
				return v === undefined ? null : v;
			},
			getInteger: (name) => {
				const v = getOpt(name);
				return v === undefined ? null : v;
			},
			getBoolean: (name) => {
				const v = getOpt(name);
				return v === undefined ? null : v;
			},
		},
		reply: async (payload) => {
			calls.reply.push(payload);
			state.replied = true;
			return payload;
		},
		deferReply: async (payload) => {
			calls.deferReply.push(payload);
			state.deferred = true;
			return payload;
		},
		editReply: async (payload) => {
			calls.editReply.push(payload);
			return payload;
		},
		followUp: async (payload) => {
			calls.followUp.push(payload);
			return payload;
		},
		update: async (payload) => {
			calls.update.push(payload);
			state.replied = true;
			return payload;
		},
		deferUpdate: async (payload) => {
			calls.deferUpdate.push(payload || {});
			state.deferred = true;
			return payload;
		},
	};

	return { interaction, calls };
}

function assertRepliedEphemeral(payload) {
	// Discord.js accepts {ephemeral:true} and in some cases {flags:64}.
	assert.ok(payload, 'Expected a reply payload');
	if (Object.prototype.hasOwnProperty.call(payload, 'ephemeral')) {
		assert.equal(payload.ephemeral, true, 'Expected ephemeral reply');
		return;
	}
	if (Object.prototype.hasOwnProperty.call(payload, 'flags')) {
		assert.equal(payload.flags, 64, 'Expected flags=64 (ephemeral)');
		return;
	}
	assert.fail('Expected reply to be ephemeral via payload.ephemeral or payload.flags');
}

/** The single outbound response (reply or editReply), regardless of ack style. */
function responseOf(calls) {
	const all = [...calls.reply, ...calls.editReply];
	assert.equal(all.length, 1, `Expected exactly one response, got ${all.length}`);
	return all[0];
}

/** Assert the interaction was acknowledged ephemerally (direct reply or deferReply 64). */
function assertEphemeralAck(calls) {
	if (calls.deferReply.length) {
		assert.equal(calls.deferReply[0].flags, 64, 'Expected deferReply({flags:64})');
		return;
	}
	assertRepliedEphemeral(responseOf(calls));
}

module.exports = {
	makeInteraction,
	assertRepliedEphemeral,
	responseOf,
	assertEphemeralAck,
};
