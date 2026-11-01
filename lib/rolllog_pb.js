const { runPb } = require('./pb');

const COLLECTION = process.env.PB_ROLLLOG_COLLECTION || 'rhune_roll_logs';

// Roll logs are guild + channel scoped. All access runs through runPb for
// connection resilience shared across guilds.

async function logRoll({ guildId, channelId, userId, commandName, expr = null, mode = null, result }) {
	return runPb(async pb => {
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
	});
}

module.exports = {
	logRoll,
};
