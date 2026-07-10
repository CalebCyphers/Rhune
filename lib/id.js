const Chance = require('chance');

const chance = new Chance();

function rollId(prefix = 'r') {
	// 8 chars is enough to avoid collisions for our scale, and easy to type.
	return `${prefix}_${chance.string({ length: 8, pool: 'abcdefghijklmnopqrstuvwxyz0123456789' })}`;
}

module.exports = {
	rollId,
};
