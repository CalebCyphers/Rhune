const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const DICE_DIR = path.join(__dirname, '..', 'assets', 'dice');

// Small in-memory cache: key -> PNG buffer
const cache = new Map();
const MAX_CACHE = 200;

function cacheGet(key) {
	return cache.get(key) || null;
}

function cacheSet(key, buf) {
	cache.set(key, buf);
	if (cache.size > MAX_CACHE) {
		const firstKey = cache.keys().next().value;
		cache.delete(firstKey);
	}
}

function diePath(sides, face) {
	return path.join(DICE_DIR, `d${sides}-${face}.png`);
}

// Color coding: on d6 pools, 1s read red (bust), 6s read green (a strong
// success), and the community's result die reads gold. Other die types get a
// neutral ring (their faces carry no bust/success meaning).
const COLOR_ONE = '#e5484d';
const COLOR_SIX = '#3fb950';
const COLOR_RESULT = '#d29922';
const COLOR_NEUTRAL = '#6b645c';

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

/**
 * Render a strip of dice faces, color-coded so the eye finds the important dice.
 *
 * @param {object} opts
 * @param {number} opts.sides               die type (4/6/8/10/12/20)
 * @param {number[]} opts.rolls             every die rolled, in order
 * @param {number|null} [opts.droppedIndex] index dropped by adv/dis (grayed out)
 * @param {number|null} [opts.resultIndex]  index of the community's result die (gold ring)
 * @returns {Promise<Buffer>} PNG buffer
 */
async function renderDiceStrip({ sides, rolls, droppedIndex = null, resultIndex = null }) {
	if (!Array.isArray(rolls) || rolls.length < 1 || rolls.length > 20) {
		throw new Error('renderDiceStrip: rolls must be length 1–20');
	}
	for (const r of rolls) {
		if (!Number.isInteger(r) || r < 1 || r > sides) throw new Error(`renderDiceStrip: invalid d${sides} face`);
	}
	if (droppedIndex !== null && (!Number.isInteger(droppedIndex) || droppedIndex < 0 || droppedIndex >= rolls.length)) {
		throw new Error('renderDiceStrip: invalid droppedIndex');
	}

	const key = `d${sides}:${rolls.join(',')}:d:${droppedIndex === null ? 'x' : droppedIndex}:r:${resultIndex === null ? 'x' : resultIndex}`;
	const cached = cacheGet(key);
	if (cached) return cached;

	const dieSize = 56;
	const gap = 10;
	const pad = 10;
	const ring = 4;
	const width = pad * 2 + rolls.length * dieSize + (rolls.length - 1) * gap;
	const height = pad * 2 + dieSize;

	const canvas = createCanvas(width, height);
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, width, height);

	for (let i = 0; i < rolls.length; i++) {
		const face = rolls[i];
		const dropped = droppedIndex !== null && i === droppedIndex;
		const x = pad + i * (dieSize + gap);
		const y = pad;

		ctx.save();
		if (dropped) ctx.globalAlpha = 0.4;
		const img = await loadImage(fs.readFileSync(diePath(sides, face)));
		ctx.drawImage(img, x, y, dieSize, dieSize);
		ctx.restore();

		// Colored ring: red for d6 1s, green for d6 6s, gold for the result die,
		// neutral otherwise. Dropped dice get no ring.
		if (dropped) continue;

		let color = COLOR_NEUTRAL;
		let lineWidth = 2;
		if (sides === 6 && face === 1) { color = COLOR_ONE; lineWidth = ring; }
		else if (sides === 6 && face === 6) { color = COLOR_SIX; lineWidth = ring; }
		else if (resultIndex !== null && i === resultIndex) { color = COLOR_RESULT; lineWidth = ring; }

		ctx.save();
		ctx.strokeStyle = color;
		ctx.lineWidth = lineWidth;
		const inset = lineWidth / 2;
		roundRect(ctx, x + inset, y + inset, dieSize - lineWidth, dieSize - lineWidth, 10);
		ctx.stroke();
		ctx.restore();
	}

	const buf = canvas.toBuffer('image/png');
	cacheSet(key, buf);
	return buf;
}

/** d6 pool/community strip (kept as a named wrapper for existing callers). */
async function renderD6Strip(opts) {
	return renderDiceStrip({ ...opts, sides: 6 });
}

module.exports = {
	renderD6Strip,
	renderDiceStrip,
	COLOR_ONE,
	COLOR_SIX,
	COLOR_RESULT,
};
