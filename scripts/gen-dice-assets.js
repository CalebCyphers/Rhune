// Generate stylized dice face assets (d4/d8/d10/d12) matching the existing
// d6/d20 look: dark fill, light-blue edges, near-white number.
//
//   node scripts/gen-dice-assets.js
//
// Writes assets/dice/<die>-<n>.png for each face. Idempotent.

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const OUT = path.join(__dirname, '..', 'assets', 'dice');
const SIZE = 128;

const FILL = '#121216';          // rgb(18,18,22)
const EDGE = '#78c8ff';          // rgb(120,200,255)
const NUM = '#f5f5fa';           // rgb(245,245,250)

const cx = SIZE / 2;
const cy = SIZE / 2;

function pentagon(r, rotDeg) {
	const pts = [];
	for (let i = 0; i < 5; i++) {
		const a = ((rotDeg + i * 72) * Math.PI) / 180;
		pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
	}
	return pts;
}

// Each shape: outer silhouette + inner facet lines + number placement.
const SHAPES = {
	d4: {
		outer: [[64, 16], [114, 110], [14, 110]],
		inner: [[[64, 78.7], [64, 16]], [[64, 78.7], [114, 110]], [[64, 78.7], [14, 110]]],
		num: [64, 86],
		size: 30,
	},
	d8: {
		outer: [[64, 10], [116, 64], [64, 118], [12, 64]],
		inner: [[[64, 10], [64, 118]], [[12, 64], [116, 64]]],
		num: [64, 65],
		size: 34,
	},
	d10: {
		outer: [[64, 8], [112, 50], [64, 120], [16, 50]],
		inner: [[[16, 50], [112, 50]], [[64, 8], [64, 50]]],
		num: [64, 72],
		size: 32,
	},
	d12: {
		outer: pentagon(56, -90),
		inner: (() => {
			const outer = pentagon(56, -90);
			const inner = pentagon(32, -90);
			const lines = [];
			for (let i = 0; i < 5; i++) lines.push([outer[i], inner[i]]);
			for (let i = 0; i < 5; i++) lines.push([inner[i], inner[(i + 1) % 5]]);
			return lines;
		})(),
		num: [64, 65],
		size: 30,
	},
};

const SIDES = { d4: 4, d8: 8, d10: 10, d12: 12 };

function poly(ctx, pts) {
	ctx.beginPath();
	ctx.moveTo(pts[0][0], pts[0][1]);
	for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
	ctx.closePath();
}

function drawDie(kind, n) {
	const shape = SHAPES[kind];
	const canvas = createCanvas(SIZE, SIZE);
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, SIZE, SIZE);

	// Solid body.
	poly(ctx, shape.outer);
	ctx.fillStyle = FILL;
	ctx.fill();

	// Inner facet lines (softer).
	ctx.save();
	ctx.strokeStyle = EDGE;
	ctx.globalAlpha = 0.5;
	ctx.lineWidth = 2;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	for (const [a, b] of shape.inner) {
		ctx.beginPath();
		ctx.moveTo(a[0], a[1]);
		ctx.lineTo(b[0], b[1]);
		ctx.stroke();
	}
	ctx.restore();

	// Crisp outline.
	poly(ctx, shape.outer);
	ctx.strokeStyle = EDGE;
	ctx.lineWidth = 3;
	ctx.lineJoin = 'round';
	ctx.stroke();

	// Number.
	ctx.fillStyle = NUM;
	ctx.font = `bold ${shape.size}px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(String(n), shape.num[0], shape.num[1]);

	return canvas.toBuffer('image/png');
}

let written = 0;
for (const [kind, faces] of Object.entries(SIDES)) {
	for (let n = 1; n <= faces; n++) {
		fs.writeFileSync(path.join(OUT, `${kind}-${n}.png`), drawDie(kind, n));
		written++;
	}
}
console.log(`wrote ${written} dice assets to ${OUT}`);
