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

function getLastRoll({ guildId, userId }) {
	migrate();
	const db = initDb();
	const row = db.prepare(`
		SELECT id, created_at, guild_id, channel_id, user_id, command_name, expr, mode, result_json
		FROM roll_logs
		WHERE user_id = ? AND (? IS NULL OR guild_id = ?)
		ORDER BY datetime(created_at) DESC
		LIMIT 1
	`).get(userId, guildId || null, guildId || null);

	if (!row) return null;
	return {
		id: row.id,
		createdAt: row.created_at,
		guildId: row.guild_id,
		channelId: row.channel_id,
		userId: row.user_id,
		commandName: row.command_name,
		expr: row.expr,
		mode: row.mode,
		result: JSON.parse(row.result_json),
	};
}

module.exports = {
	logRoll,
	getLastRoll,
};
