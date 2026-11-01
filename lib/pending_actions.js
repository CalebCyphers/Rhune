// In-memory pending actions keyed by userId.
// V1 simplicity: ephemeral disambiguation, single outstanding action per user.
// Entries expire so a stale pending action can't collide with a later click.

const pendingByUser = new Map();

// A pending action older than this is discarded (stale disambiguation).
const PENDING_TTL_MS = 15 * 60 * 1000;

function setPending(userId, pending) {
	pendingByUser.set(userId, { ...pending, createdAt: Date.now() });
}

function getPending(userId) {
	const p = pendingByUser.get(userId) || null;
	if (p && Date.now() - (p.createdAt || 0) > PENDING_TTL_MS) {
		pendingByUser.delete(userId);
		return null;
	}
	return p;
}

function clearPending(userId) {
	pendingByUser.delete(userId);
}

module.exports = {
	setPending,
	getPending,
	clearPending,
	PENDING_TTL_MS,
};
