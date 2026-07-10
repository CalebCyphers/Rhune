const PocketBase = require('pocketbase/cjs');

let client = null;

/**
 * Lazily initialize PocketBase client and (if provided) authenticate as admin.
 *
 * Env vars:
 * - PB_URL (required)
 * - PB_ADMIN_EMAIL (optional)
 * - PB_ADMIN_PASSWORD (optional)
 */
async function getPb() {
	if (client) return client;

	const baseUrl = process.env.PB_URL;
	if (!baseUrl) throw new Error('PB_URL is required');

	client = new PocketBase(baseUrl);

	// Admin auth is optional but recommended for bot-private collections.
	const email = process.env.PB_ADMIN_EMAIL;
	const password = process.env.PB_ADMIN_PASSWORD;
	if (email && password) {
		await client.admins.authWithPassword(email, password);
	}

	return client;
}

module.exports = { getPb };
