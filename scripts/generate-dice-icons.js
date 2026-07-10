// Generates simple stylized dice icons into assets/dice.
//
// Usage:
//   node scripts/generate-dice-icons.js
//
// Requires dev dependency: @napi-rs/canvas

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('@napi-rs/canvas');

const outDir = path.join(__dirname, '..', 'assets', 'dice');
fs.mkdirSync(outDir, { recursive: true });

function drawRoundedRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

const bg = '#121216';
const fg = '#f5f5fa';
const accent = '#78c8ff';

function savePNG(name, canvas) {
	fs.writeFileSync(path.join(outDir, name), canvas.toBuffer('image/png'));
}

function makeD6(face) {
	const size = 128;
	const canvas = createCanvas(size, size);
	const ctx = canvas.getContext('2d');

	ctx.clearRect(0, 0, size, size);

	const pad = 10;
	ctx.lineWidth = 3;
	drawRoundedRect(ctx, pad, pad, size - pad * 2, size - pad * 2, 22);
	ctx.fillStyle = bg;
	ctx.fill();
	ctx.strokeStyle = accent;
	ctx.stroke();

	const pipR = 8;
	const g = [
		[0.30, 0.30], [0.50, 0.30], [0.70, 0.30],
		[0.30, 0.50], [0.50, 0.50], [0.70, 0.50],
		[0.30, 0.70], [0.50, 0.70], [0.70, 0.70],
	].map(([x, y]) => [x * size, y * size]);

	const patterns = {
		1: [4],
		2: [0, 8],
		3: [0, 4, 8],
		4: [0, 2, 6, 8],
		5: [0, 2, 4, 6, 8],
		6: [0, 2, 3, 5, 6, 8],
	};

	ctx.fillStyle = fg;
	for (const idx of patterns[face]) {
		const [x, y] = g[idx];
		ctx.beginPath();
		ctx.arc(x, y, pipR, 0, Math.PI * 2);
		ctx.fill();
	}

	return canvas;
}

function makeD20(face) {
	const size = 128;
	const canvas = createCanvas(size, size);
	const ctx = canvas.getContext('2d');
	ctx.clearRect(0, 0, size, size);

	const cx = size / 2;
	const cy = size / 2;
	const R = 54;

	const pts = [];
	for (let i = 0; i < 10; i++) {
		const ang = (Math.PI * 2) * (i / 10) - Math.PI / 2;
		const r = (i % 2 === 0) ? R : R * 0.78;
		pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
	}

	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(pts[0][0], pts[0][1]);
	for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
	ctx.closePath();
	ctx.fillStyle = bg;
	ctx.fill();
	ctx.strokeStyle = accent;
	ctx.stroke();

	ctx.lineWidth = 2;
	ctx.strokeStyle = accent;
	function line(a, b) {
		ctx.beginPath();
		ctx.moveTo(pts[a][0], pts[a][1]);
		ctx.lineTo(pts[b][0], pts[b][1]);
		ctx.stroke();
	}
	line(0, 3);
	line(0, 7);
	line(5, 2);
	line(5, 8);

	const txt = String(face);
	const fontSize = face < 10 ? 56 : (face < 20 ? 52 : 50);
	ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
	ctx.fillStyle = fg;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(txt, cx, cy + 1);

	return canvas;
}

for (let i = 1; i <= 6; i++) savePNG(`d6-${i}.png`, makeD6(i));
for (let i = 1; i <= 20; i++) savePNG(`d20-${i}.png`, makeD20(i));

console.log('Generated dice icons in', outDir);
