const assert = require('node:assert/strict');

// Purpose: small test helpers shared across command tests.
// - makeInteraction(): creates a minimal discord.js-ish interaction stub + captures reply calls.
// - assertRepliedEphemeral(): ensures replies are ephemeral (either ephemeral:true or flags:64).
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
	};

	function getOpt(name) {
		return Object.prototype.hasOwnProperty.call(options, name) ? options[name] : null;
	}

	const interaction = {
		guildId,
		user: { id: userId },
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
			return payload;
		},
		deferReply: async (payload) => {
			calls.deferReply.push(payload);
			return payload;
		},
		editReply: async (payload) => {
			calls.editReply.push(payload);
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

module.exports = {
	makeInteraction,
	assertRepliedEphemeral,
};
