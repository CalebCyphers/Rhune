const PocketBase = require('pocketbase/cjs');

let client = null;

// A single shared PocketBase instance serves ALL guilds (Option 1).
// Multi-guild robustness lives here: lazy connect, re-auth on token expiry,
// and bounded retry with backoff for transient server-side errors.

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_ATTEMPTS = 4;
const BASE_DELAY_MS = 250;

function trimSlash(url) {
	return String(url || '').replace(/\/+$/, '');
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function statusOf(err) {
	return err?.status ?? err?.data?.status ?? err?.response?.status ?? null;
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
 * (Re)authenticate the shared client as a PocketBase admin.
 * Requires env: PB_URL (required), PB_ADMIN_EMAIL (required), PB_ADMIN_PASSWORD (required).
 */
async function forceReauth() {
	const baseUrl = process.env.PB_URL;
	if (!baseUrl) throw new Error('PB_URL is required');

	if (!client) client = new PocketBase(baseUrl);

	const email = process.env.PB_ADMIN_EMAIL;
	const password = process.env.PB_ADMIN_PASSWORD;
	if (!email || !password) {
		throw new Error('PocketBase admin auth is required. Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD.');
	}

	const authData = await adminAuthWithPassword({ baseUrl, email, password });

	// Populate the PocketBase authStore so subsequent API calls include the token.
	if (authData?.token) {
		client.authStore.save(authData.token, authData.admin || null);
	}

	return client;
}

/**
 * Lazily initialize (and, if needed, re-authenticate) the shared PocketBase client.
 * Returns an authenticated client. A present-but-expired token is handled by
 * runPb() (it catches 401 and calls forceReauth()).
 */
async function getPb() {
	if (client && client.authStore?.token) return client;
	return forceReauth();
}

/**
 * Run a PocketBase operation with multi-guild-safe connection handling:
 *  - 401 (admin token expired/invalid) -> forceReauth() then retry.
 *  - Transient server-side errors (5xx, 408, 425, 429) -> bounded retry with backoff.
 *  - Ambiguous network errors are NOT retried (we can't tell if the request applied,
 *    so retrying could double-apply a write like a character create).
 *
 * @param {function(PocketBase):Promise<any>} fn Operation receiving the authed client.
 * @param {{attempts?: number}} [opts]
 */
async function runPb(fn, { attempts = DEFAULT_ATTEMPTS } = {}) {
	let lastErr;

	for (let i = 0; i < attempts; i++) {
		try {
			const pb = await getPb();
			return await fn(pb);
		}
		catch (err) {
			lastErr = err;
			const status = statusOf(err);

			// Token expired/invalid -> re-auth and retry (doesn't consume a backoff slot).
			if (status === 401) {
				await forceReauth();
				continue;
			}

			// Transient server-side error -> backoff and retry until final attempt.
			if (RETRYABLE_STATUS.has(status) && i < attempts - 1) {
				const delay = BASE_DELAY_MS * (2 ** i);
				await sleep(delay);
				continue;
			}

			throw err;
		}
	}

	throw lastErr;
}

/** For tests: drop the cached client so getPb() re-initializes/re-auths. */
function resetPbClient() {
	client = null;
}

module.exports = {
	getPb,
	runPb,
	forceReauth,
	resetPbClient,
	adminAuthWithPassword,
};
