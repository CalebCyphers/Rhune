const { getPb } = require('./pb');

async function pbDiagnostics() {
	const baseUrl = process.env.PB_URL;
	const debug = process.env.PB_DEBUG === '1';
	if (!debug) return;

	console.log('[pb] env PB_URL=', baseUrl);

	// 1) Basic reachability test (no auth needed)
	try {
		const healthUrl = String(baseUrl || '').replace(/\/+$/, '') + '/api/health';
		const res = await fetch(healthUrl);
		const text = await res.text();
		console.log('[pb] health', res.status, text.slice(0, 200));
	}
	catch (err) {
		console.log('[pb] health check failed:', err?.message || String(err));
	}

	// 2) Force client init and print actual SDK baseUrl + auth state
	try {
		const pb = await getPb();
		console.log('[pb] sdk baseUrl=', pb.baseUrl);
		console.log('[pb] admin authed=', Boolean(pb.authStore?.token));
	}
	catch (err) {
		console.log('[pb] client init failed:', err?.message || String(err));
	}
}

module.exports = { pbDiagnostics };
