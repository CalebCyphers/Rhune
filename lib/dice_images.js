const fs = require('fs');
const path = require('path');

const DICE_DIR = path.join(__dirname, '..', 'assets', 'dice');

// Die types we have face art for (scripts/gen-dice-assets.js generates
// d4/d8/d10/d12; d6/d20 predate it).
const ART_SIDES = new Set([4, 6, 8, 10, 12, 20]);

function isSafeFace(face, max) {
	return Number.isInteger(face) && face >= 1 && face <= max;
}

function diceImagePath({ sides, face }) {
	if (!ART_SIDES.has(sides) || !isSafeFace(face, sides)) return null;
	const p = path.join(DICE_DIR, `d${sides}-${face}.png`);
	return fs.existsSync(p) ? p : null;
}

function diceImageName({ sides, face }) {
	if (!ART_SIDES.has(sides) || !isSafeFace(face, sides)) return null;
	return `d${sides}-${face}.png`;
}

module.exports = {
	diceImagePath,
	diceImageName,
	ART_SIDES,
};
