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

	// Admin auth is required for bot-private (admin-only) collections.
	const email = process.env.PB_ADMIN_EMAIL;
	const password = process.env.PB_ADMIN_PASSWORD;
	if (!email || !password) {
		throw new Error('PocketBase admin auth is required. Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD.');
	}
	await client.admins.authWithPassword(email, password);

	// If you're using PocketBase behind a reverse proxy/subpath, allow overriding.
	// Useful for debugging what baseUrl the SDK is actually calling.
	if (process.env.PB_DEBUG === '1') {
		console.log('[pb] baseUrl=', client.baseUrl);
		console.log('[pb] admin authed=', Boolean(client.authStore?.token));
	}

	return client;
}

module.exports = { getPb };
