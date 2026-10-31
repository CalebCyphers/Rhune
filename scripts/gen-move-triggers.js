#!/usr/bin/env node
// Generate lib/move_triggers.js from the rhune-ttrpg vault.
//
// Each move's "when…" trigger is the opening sentence of its rules text.
// We read the canonical vault files (stat-less rules), match them to the
// bot's move names, and emit a name → trigger map.
//
// Run: node scripts/gen-move-triggers.js [--check]
//   --check  exit non-zero if the generated file would change (CI-friendly)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VAULT = path.resolve(ROOT, '../rhune-ttrpg/RULES');
const CORE_DIR = path.join(VAULT, 'moves');
const PB_DIR = path.join(VAULT, '02-playbooks');

// Hand-written triggers for moves the vault can't supply a clean "when" for:
// pointer stubs, list-style special moves, and moves with no page yet.
// Keyed by normalized move name.
const OVERRIDES = {
	"death's door": "When you're dying (0 HP from a killing blow)",
	'advantage disadvantage': 'When you roll with advantage or disadvantage',
	'a bundle of sticks unbroken': 'As long as you are traveling with a follower',
};

const normalize = s => String(s == null ? '' : s).toLowerCase()
	.replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim();

// Overrides keyed by normalized name (so apostrophes/punctuation don't matter).
const OVERRIDE_BY_NORM = {};
for (const [k, v] of Object.entries(OVERRIDES)) OVERRIDE_BY_NORM[normalize(k)] = v;

/** First sentence, parenthesis-aware (don't split on "etc." inside parens). */
function firstSentence(text) {
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === '(') depth++;
		else if (c === ')') depth = Math.max(0, depth - 1);
		else if (c === '.' && depth === 0) {
			const next = text[i + 1];
			if (next === undefined || next === ' ') return text.slice(0, i + 1).trim();
		}
	}
	return text.trim();
}

const stripInline = t => t
	.replace(/\s+/g, ' ')
	.replace(/\*\*\*(.+?)\*\*\*/g, '$1')
	.replace(/\*\*(.+?)\*\*/g, '$1')
	.replace(/\*(.+?)\*/g, '$1')
	.replace(/`(.+?)`/g, '$1')
	.replace(/\*/g, '')
	.trim();

/** Trim trailing instruction cruft from a trigger clause:
 *  - a trailing ", roll." (only when a comma precedes it, so "— or roll." survives)
 *  - a trailing "…, they pick 1:" list-intro
 *  - a dangling colon and final period. */
const trimTrigger = t => t
	.replace(/,\s*roll\.?$/i, '')
	.replace(/[,\s]+(?:and\s+)?(?:you|they|we)?\s*(?:pick|choose|select)\s+\d+\s*:?$/i, '')
	.replace(/[:;]\s*$/, '')
	.replace(/\.$/, '')
	.replace(/[\s—–-]+$/, '')
	.trim();

/**
 * Extract the opening trigger/body paragraph from a vault move file.
 * Returns { text, kind } where kind is 'when' | 'passive' | 'pointer' | 'none'.
 */
function extractTrigger(raw) {
	const lines = raw.split('\n');
	const attrIdx = lines.findIndex(l => /^\*A (playbook|starting) move from/.test(l.trim()));
	const body = (attrIdx >= 0 ? lines.slice(attrIdx + 1) : lines).join('\n');

	// Paragraphs separated by blank lines.
	const paras = body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
	for (const p of paras) {
		if (/^#/.test(p)) continue;                         // markdown heading
		if (/^\*\s*\(Requires/.test(p)) continue;          // "(Requires …)" line
		if (/^---/.test(p)) continue;                        // hr
		// Only the first physical line of the paragraph is the trigger/body.
		// (List items or extra prose follow on subsequent lines.)
		const firstLine = p.split('\n')[0].trim();
		if (!firstLine) continue;
		const isItalic = /^\*(?!\*)/.test(firstLine);
		if (isItalic) {
			const t = stripInline(firstLine.replace(/^\*+/, '').replace(/\*+$/, ''));
			if (!t) continue;
			if (/^→|^see `/i.test(t)) return { text: t, kind: 'pointer' };
			const s = firstSentence(t);
			return { text: trimTrigger(s), kind: /^(when|whenever|while|after|before|each time|if|once per|any time)\b/i.test(t) ? 'when' : 'passive' };
		}
		// Plain paragraph (passive/permanent move).
		const t = stripInline(firstLine);
		if (!t) continue;
		if (/^→|^see `/i.test(t)) return { text: t, kind: 'pointer' };
		const s = firstSentence(t);
		return { text: trimTrigger(s), kind: /^(when|whenever|while|after|before|each time|if|once per|any time)\b/i.test(t) ? 'when' : 'passive' };
	}
	return { text: null, kind: 'none' };
}

function readVaultDir(dir) {
	if (!fs.existsSync(dir)) return [];
	return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => {
		const full = path.join(dir, f);
		const raw = fs.readFileSync(full, 'utf8');
		const title = (raw.split('\n')[0] || '').replace(/^#\s*/, '').trim();
		return { file: full, raw, title, key: normalize(title) };
	});
}

function main() {
	const coreVault = readVaultDir(CORE_DIR);
	const pbVault = [];
	for (const d of fs.readdirSync(PB_DIR)) {
		const dp = path.join(PB_DIR, d);
		if (!fs.statSync(dp).isDirectory()) continue;
		for (const v of readVaultDir(dp)) { v.dir = d; pbVault.push(v); }
	}

	const { moves, categoryNames, getCategoryLabel } = require(path.join(ROOT, 'lib/moves_data.js'));
	const pbmod = require(path.join(ROOT, 'lib/playbooks.js'));
	const PB_KEYS = ['Blessed', 'Fox', 'Heavy', 'Judge', 'Lightbearer', 'Marshal', 'Ranger', 'Seeker', 'WouldbeHero'];

	const triggers = {};
	const flags = [];
	const used = new Set();

	const add = (name, v, where) => {
		const ov = OVERRIDE_BY_NORM[normalize(name)];
		if (ov) { if (v) used.add(v.file); triggers[normalize(name)] = ov; flags.push({ where, name, kind: 'override', text: ov }); return; }
		used.add(v.file);
		const { text, kind } = extractTrigger(v.raw);
		if (!text) { flags.push({ where, name, kind: 'no-text' }); return; }
		triggers[normalize(name)] = text;
		if (kind === 'passive') flags.push({ where, name, kind: 'no-when', text });
		else if (kind === 'pointer') flags.push({ where, name, kind: 'pointer', text });
	};

	for (const c of categoryNames) {
		for (const name of Object.keys(moves[c])) {
			const v = coreVault.find(x => x.key === normalize(name));
			if (!v) { flags.push({ where: 'core/' + getCategoryLabel(c), name, kind: 'no-vault' }); continue; }
			add(name, v, 'core/' + getCategoryLabel(c));
		}
	}
	for (const k of PB_KEYS) {
		const p = pbmod.lookupPlaybook(k);
		if (!p) continue;
		for (const name of Object.keys(p.allMoves || {})) {
			const clean = name.replace(/\s*★\s*$/, '');
			let v = pbVault.find(x => x.key === normalize(clean));
			if (!v && /chronicler of stonetop/i.test(name)) v = pbVault.find(x => x.key === 'chronicler');
			if (!v) {
				const ov = OVERRIDE_BY_NORM[normalize(name)];
				if (ov) { triggers[normalize(name)] = ov; flags.push({ where: k, name, kind: 'override', text: ov }); }
				else { flags.push({ where: k, name, kind: 'no-vault' }); }
				continue;
			}
			add(name, v, k);		}
	}

	// Report vault files not used by any bot move (dedupe: shared copies).
	const unused = [...coreVault, ...pbVault].filter(v => !used.has(v.file) && !coreVault.includes(v));

	// Emit the module.
	const entries = Object.keys(triggers).sort().map(k =>
		`\t${JSON.stringify(k)}: ${JSON.stringify(triggers[k])},`).join('\n');
	const out = `// AUTO-GENERATED — do not edit by hand.
// Source: rhune-ttrpg/RULES (moves/ + 02-playbooks/).
// Regenerate: node scripts/gen-move-triggers.js
//
// Each entry is a move's opening "when…" trigger, keyed by normalized name
// (lowercase, "&"→"and", non-alphanumerics→spaces).

const TRIGGERS = {
${entries}
};

/** Look up a move's trigger by name (normalized). Returns null if none. */
function triggerFor(name) {
	return TRIGGERS[String(name == null ? '' : name).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim()] || null;
}

module.exports = { TRIGGERS, triggerFor };
`;

	const target = path.join(ROOT, 'lib/move_triggers.js');
	const check = process.argv.includes('--check');
	if (check) {
		const cur = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
		if (cur !== out) { console.error('move_triggers.js is stale — rerun the generator.'); process.exit(1); }
		console.log('move_triggers.js is up to date.');
		return;
	}
	fs.writeFileSync(target, out);

	// Report.
	const byKind = flags.reduce((m, f) => { (m[f.kind] = m[f.kind] || []).push(f); return m; }, {});
	console.log(`triggers written: ${Object.keys(triggers).length}`);
	console.log(`flags: ${flags.length}`);
	for (const kind of Object.keys(byKind)) {
		console.log(`\n--- ${kind} (${byKind[kind].length}) ---`);
		byKind[kind].forEach(f => console.log(`  ${f.where} / ${f.name}${f.text ? '  => ' + f.text.slice(0, 70) : ''}`));
	}
	console.log(`\n--- unused vault files (${unused.length}) ---`);
	unused.forEach(v => console.log('  ' + path.relative(PB_DIR, v.file)));
}

main();
