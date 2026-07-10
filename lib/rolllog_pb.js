const { getPb } = require('./pb');

const COLLECTION = process.env.PB_ROLLLOG_COLLECTION || 'rhune_roll_logs';

async function logRoll({ guildId, channelId, userId, commandName, expr = null, mode = null, result }) {
	const pb = await getPb();

	const record = await pb.collection(COLLECTION).create({
		guild_id: guildId || null,
		channel_id: channelId || null,
		user_id: userId,
		command_name: commandName,
		expr: expr,
		mode: mode,
		result_json: result,
	});

	return record.id;
}

async function getLastRoll({ guildId, userId }) {
	const pb = await getPb();

	const filterParts = [`user_id = "${userId}"`];
	if (guildId) filterParts.push(`guild_id = "${guildId}"`);
	const filter = filterParts.join(' && ');

	const list = await pb.collection(COLLECTION).getList(1, 1, {
		filter,
		sort: '-created',
	});

	if (!list.items.length) return null;
	const row = list.items[0];

	return {
		id: row.id,
		createdAt: row.created,
		guildId: row.guild_id || null,
		channelId: row.channel_id || null,
		userId: row.user_id,
		commandName: row.command_name,
		expr: row.expr,
		mode: row.mode,
		result: row.result_json,
	};
}

module.exports = {
	logRoll,
	getLastRoll,
};
