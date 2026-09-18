const test = require('node:test');
const assert = require('node:assert/strict');

function loadPbFreshWithEnv() {
	// pb.js insists on PB_URL during getPb()/forceReauth() if it tries to auth.
	// For these unit tests we fully stub fetch so it never actually hits network.
	process.env.PB_URL = process.env.PB_URL || 'http://example.invalid';
	process.env.PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'test@example.invalid';
	process.env.PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'x';

	delete require.cache[require.resolve('../../lib/pb')];
	return require('../../lib/pb');
}

function errWithStatus(status, message = `status ${status}`) {
	const e = new Error(message);
	e.status = status;
	return e;
}

async function withIsolatedPb(run) {
	const origFetch = global.fetch;
	global.fetch = async () => {
		// pb.forceReauth() uses adminAuthWithPassword(), which uses fetch().
		// For unit tests, return a happy-path admin auth response.
		return {
			ok: true,
			status: 200,
			text: async () => JSON.stringify({ token: 't', admin: { id: 'a' } }),
		};
	};

	try {
		const pb = loadPbFreshWithEnv();
		return await run(pb);
	}
	finally {
		global.fetch = origFetch;
	}
}

// IMPORTANT: pb.runPb closes over internal getPb/forceReauth functions.
// Overriding exported pb.getPb/pb.forceReauth will NOT affect runPb.
// So for these tests we replace env vars to allow forceReauth to run without
// touching real infra, and we stub global.fetch to ensure zero network calls.

test('runPb: retries once on 401 by reauthing then succeeding', async () => {
	await withIsolatedPb(async (pb) => {
		// We can't easily count internal forceReauth() calls because runPb closes over
		// module-scoped functions. Instead, we assert behavior: a 401 triggers a reauth
		// (which triggers fetch), then a retry succeeds.
		pb.resetPbClient();

		let fetchCalls = 0;
		const origFetch = global.fetch;
		global.fetch = async () => {
			fetchCalls += 1;
			return {
				ok: true,
				status: 200,
				text: async () => JSON.stringify({ token: 't', admin: { id: 'a' } }),
			};
		};

		try {
			let attempts = 0;
			const res = await pb.runPb(async () => {
				attempts += 1;
				if (attempts === 1) throw errWithStatus(401, 'expired');
				return 'ok';
			});
			assert.equal(res, 'ok');
			assert.equal(attempts, 2);
			assert.ok(fetchCalls >= 1, 'expected at least one reauth fetch call');
		}
		finally {
			global.fetch = origFetch;
		}
	});
});

test('runPb: retries bounded on admin 403 then succeeds', async () => {
	await withIsolatedPb(async (pb) => {
		pb.resetPbClient();

		const origAdminAuth = pb.adminAuthWithPassword;
		pb.adminAuthWithPassword = async () => ({ token: 't', admin: { id: 'a' } });

		let attempts = 0;
		const adminErr = errWithStatus(403, 'Only admins can perform this action.');

		const res = await pb.runPb(async () => {
			attempts += 1;
			if (attempts <= 2) throw adminErr;
			return 'ok';
		});

		assert.equal(res, 'ok');
		pb.adminAuthWithPassword = origAdminAuth;
	});
});

test('runPb: gives up after MAX_ADMIN_REAUTH on admin 403', async () => {
	await withIsolatedPb(async (pb) => {
		pb.resetPbClient();
		const origAdminAuth = pb.adminAuthWithPassword;
		pb.adminAuthWithPassword = async () => ({ token: 't', admin: { id: 'a' } });

		const adminErr = errWithStatus(403, 'Only admins can perform this action.');

		await assert.rejects(
			() => pb.runPb(async () => { throw adminErr; }),
			(err) => {
				assert.equal(err, adminErr);
				return true;
			},
		);

		pb.adminAuthWithPassword = origAdminAuth;
	});
});

test('runPb: retries with backoff on retryable 5xx and eventually succeeds', async () => {
	await withIsolatedPb(async (pb) => {
		pb.resetPbClient();
		const origAdminAuth = pb.adminAuthWithPassword;
		pb.adminAuthWithPassword = async () => ({ token: 't', admin: { id: 'a' } });

		const delays = [];
		const origSetTimeout = global.setTimeout;
		global.setTimeout = (fn, ms, ...rest) => {
			delays.push(ms);
			return origSetTimeout(fn, 0, ...rest);
		};

		try {
			let attempts = 0;
			const res = await pb.runPb(async () => {
				attempts += 1;
				if (attempts <= 2) throw errWithStatus(503, 'nope');
				return 'ok';
			});
			assert.equal(res, 'ok');
			assert.deepEqual(delays.slice(0, 2), [250, 500]);
		}
		finally {
			global.setTimeout = origSetTimeout;
			pb.adminAuthWithPassword = origAdminAuth;
		}
	});
});

test('runPb: does not retry on ambiguous error with no status', async () => {
	await withIsolatedPb(async (pb) => {
		pb.resetPbClient();
		const origAdminAuth = pb.adminAuthWithPassword;
		pb.adminAuthWithPassword = async () => ({ token: 't', admin: { id: 'a' } });

		let calls = 0;
		const err = new Error('socket hang up');

		await assert.rejects(
			() => pb.runPb(async () => { calls += 1; throw err; }),
			(e) => {
				assert.equal(e, err);
				return true;
			},
		);

		assert.equal(calls, 1);
		pb.adminAuthWithPassword = origAdminAuth;
	});
});
