const PocketBase = require('pocketbase/cjs');

let client = null;

function trimSlash(url) {
	return String(url || '').replace(/\/+$/, '');
}

async function adminAuthWithPassword({ baseUrl, email, password }) {
	// PocketBase admin auth endpoint (v0.17.0): POST /api/admins/auth-with-password
	// We do this via fetch to avoid SDK/server version mismatches.
	const url = `${trimSlash(baseUrl)}/api/admins/auth-with-password`;

	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ identity: email, password }),
	});

	const text = await res.text();
	let data;
	try { data = JSON.parse(text); }
	catch { data = { raw: text }; }

	if (!res.ok) {
		const msg = data?.message || `Admin auth failed (${res.status})`;
		const err = new Error(msg);
		err.status = res.status;
		err.data = data;
		err.url = url;
		throw err;
	}

	return data;
}

/**
 * Lazily initialize PocketBase client and authenticate as admin.
 *
 * Env vars:
 * - PB_URL (required)
 * - PB_ADMIN_EMAIL (required)
 * - PB_ADMIN_PASSWORD (required)
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

	const authData = await adminAuthWithPassword({ baseUrl, email, password });

	// Populate the PocketBase authStore so subsequent API calls include the token.
	// We only need the token for admin-only collection access.
	if (authData?.token) {
		client.authStore.save(authData.token, authData.admin || null);
	}

	return client;
}

module.exports = { getPb };
