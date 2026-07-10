const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const D6_DIR = path.join(__dirname, '..', 'assets', 'dice');

// Small in-memory cache: key -> PNG buffer
const cache = new Map();
const MAX_CACHE = 200;

function cacheGet(key) {
	return cache.get(key) || null;
}

function cacheSet(key, buf) {
	cache.set(key, buf);
	// simple FIFO eviction
	if (cache.size > MAX_CACHE) {
		const firstKey = cache.keys().next().value;
		cache.delete(firstKey);
	}
}

function d6Path(face) {
	return path.join(D6_DIR, `d6-${face}.png`);
}

async function renderPbtaD6Strip({ rolls, droppedIndex = null }) {
	if (!Array.isArray(rolls) || (rolls.length !== 2 && rolls.length !== 3)) {
		throw new Error('renderPbtaD6Strip: rolls must be length 2 or 3');
	}
	for (const r of rolls) {
		if (!Number.isInteger(r) || r < 1 || r > 6) throw new Error('renderPbtaD6Strip: invalid d6 face');
	}
	if (droppedIndex !== null && (!Number.isInteger(droppedIndex) || droppedIndex < 0 || droppedIndex >= rolls.length)) {
		throw new Error('renderPbtaD6Strip: invalid droppedIndex');
	}

	const key = `pbta:${rolls.join(',')}:drop:${droppedIndex === null ? 'none' : droppedIndex}`;
	const cached = cacheGet(key);
	if (cached) return cached;

	const dieSize = 44;
	const gap = 6;
	const pad = 4;
	const width = pad * 2 + rolls.length * dieSize + (rolls.length - 1) * gap;
	const height = pad * 2 + dieSize;

	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, width, height);

	for (let i = 0; i < rolls.length; i++) {
		const face = rolls[i];
		const img = await loadImage(fs.readFileSync(d6Path(face)));
		const x = pad + i * (dieSize + gap);
		const y = pad;
		ctx.drawImage(img, x, y, dieSize, dieSize);

		if (droppedIndex !== null && i === droppedIndex) {
			// Gray out dropped die.
			ctx.save();
			ctx.globalAlpha = 0.55;
			ctx.fillStyle = '#000000';
			ctx.fillRect(x, y, dieSize, dieSize);
			ctx.restore();
		}
	}

	const buf = canvas.toBuffer('image/png');
	cacheSet(key, buf);
	return buf;
}

module.exports = {
	renderPbtaD6Strip,
};
