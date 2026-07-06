const { initDb, migrate } = require('./db');
const { rollId } = require('./id');

function logRoll({ guildId, channelId, userId, commandName, expr = null, mode = null, result }) {
	migrate();
	const db = initDb();

	const id = rollId('roll');
	const stmt = db.prepare(`
		INSERT INTO roll_logs (id, guild_id, channel_id, user_id, command_name, expr, mode, result_json)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`);

	stmt.run(
		id,
		guildId || null,
		channelId || null,
		userId,
		commandName,
		expr,
		mode,
		JSON.stringify(result),
	);

	return id;
}

module.exports = {
	logRoll,
};
