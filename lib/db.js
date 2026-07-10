const fs = require('fs');
const path = require('path');

const Database = require('better-sqlite3');

let db;

function getDbPath() {
	const configured = process.env.DB_PATH;
	if (configured) return configured;
	return path.join(__dirname, '..', 'data', 'rhune.sqlite');
}

function ensureDirForFile(filePath) {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
}

function initDb() {
	if (db) return db;

	const dbPath = getDbPath();
	ensureDirForFile(dbPath);

	db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');

	// Basic migrations table.
	db.exec(`
		CREATE TABLE IF NOT EXISTS migrations (
			id TEXT PRIMARY KEY,
			applied_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
	`);

	return db;
}

function hasMigration(id) {
	const row = initDb().prepare('SELECT id FROM migrations WHERE id = ?').get(id);
	return Boolean(row);
}

function applyMigration(id, sql) {
	if (hasMigration(id)) return;
	const database = initDb();
	database.transaction(() => {
		database.exec(sql);
		database.prepare('INSERT INTO migrations (id) VALUES (?)').run(id);
	})();
}

function migrate() {
	applyMigration('001_roll_logs', `
		CREATE TABLE IF NOT EXISTS roll_logs (
			id TEXT PRIMARY KEY,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			guild_id TEXT,
			channel_id TEXT,
			user_id TEXT NOT NULL,
			command_name TEXT NOT NULL,
			expr TEXT,
			mode TEXT,
			result_json TEXT NOT NULL
		);
	`);
}

module.exports = {
	initDb,
	migrate,
};
