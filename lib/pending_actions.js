// In-memory pending actions keyed by userId.
// V1 simplicity: ephemeral disambiguation, single outstanding action per user.

const pendingByUser = new Map();

function setPending(userId, pending) {
	pendingByUser.set(userId, { ...pending, createdAt: Date.now() });
}

function getPending(userId) {
	return pendingByUser.get(userId) || null;
}

function clearPending(userId) {
	pendingByUser.delete(userId);
}

module.exports = {
	setPending,
	getPending,
	clearPending,
};
