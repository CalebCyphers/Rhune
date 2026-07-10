const path = require('path');

function isSafeFace(face, max) {
	return Number.isInteger(face) && face >= 1 && face <= max;
}

function diceImagePath({ sides, face }) {
	if (sides === 6 && isSafeFace(face, 6)) {
		return path.join(__dirname, '..', 'assets', 'dice', `d6-${face}.png`);
	}
	if (sides === 20 && isSafeFace(face, 20)) {
		return path.join(__dirname, '..', 'assets', 'dice', `d20-${face}.png`);
	}
	return null;
}

function diceImageName({ sides, face }) {
	if (sides === 6 && isSafeFace(face, 6)) return `d6-${face}.png`;
	if (sides === 20 && isSafeFace(face, 20)) return `d20-${face}.png`;
	return null;
}

module.exports = {
	diceImagePath,
	diceImageName,
};
