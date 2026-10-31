#!/usr/bin/env node
// Generate lib/site_links.js from the Rhune rules vault.
//
// The bot links out to the public rules site (https://rhune.xyz). The site's
// URL scheme mirrors the vault: RULES/<path>.md -> /<path>.html. Rather than
// hand-maintain a list, this script reads the vault and emits a lookup module.
//
// Usage:  node scripts/gen-site-links.js [vaultRULESDir]
// Default vaultRULESDir: ../rhune-ttrpg/RULES  (relative to the repo root)

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RULES = path.resolve(ROOT, process.argv[2] || path.join('..', 'rhune-ttrpg', 'RULES'));
const OUT = path.join(ROOT, 'lib', 'site_links.js');

const BASE = 'https://rhune.xyz';

// ---------------------------------------------------------------------------
// Helpers

function listDir(rel) {
	const abs = path.join(RULES, rel);
	if (!fs.existsSync(abs)) return [];
	return fs.readdirSync(abs)
		.filter((f) => f.endsWith('.md') && f !== '_index.md')
		.sort()
		.map((f) => path.posix.join(rel, f));
}

function h1(src) {
	const m = String(src || '').match(/^#\s+(.+?)\s*$/m);
	return m ? m[1].replace(/\*\*/g, '').trim() : null;
}

function read(rel) {
	try { return fs.readFileSync(path.join(RULES, rel), 'utf8'); }
	catch { return ''; }
}

// Mirror the site's slugify() so anchors match exactly.
function slugify(s) {
	return String(s).toLowerCase()
		.replace(/&amp;/g, 'and').replace(/&/g, 'and')
		.replace(/['\u2019\u2018]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '') || 'section';
}

// Title-case a vault H1 (which is often ALL CAPS) the way the bot's move
// names read: "CLASH" -> "Clash", "DEATH'S DOOR" -> "Death's Door".
function titleCase(name) {
	return String(name).split(' ').map((w) => {
		if (/^[A-Z][A-Z'&/.-]*$/.test(w)) return w[0] + w.slice(1).toLowerCase();
		return w;
	}).join(' ');
}

// A forgiving lookup key: lowercase, drop punctuation, collapse spaces.
function norm(s) {
	return String(s).toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

// Canonical key for matching a bot playbook key to a vault slug: lowercase,
// drop a leading "the", drop non-alphanumerics. "Fox"/"the-fox"/"The Fox" -> "fox".
function slugKey(s) {
	return norm(s).replace(/^the\s*/, '').replace(/\s+/g, '');
}

// ---------------------------------------------------------------------------
// Collect pages

const playbookFiles = listDir('02-playbooks').filter((f) => /the-/.test(path.basename(f)));
const playbookMoveFiles = playbookFiles.flatMap((f) =>
	listDir(path.posix.join('02-playbooks', path.posix.basename(f, '.md'))));

const groups = {
	coreMoves: listDir('moves'),
	playbooks: playbookFiles,
	playbookMoves: playbookMoveFiles,
	inserts: listDir('inserts'),
	arcanaMinor: listDir('02-playbooks/arcana/minor'),
	arcanaMajor: listDir('02-playbooks/arcana/major'),
	gear: listDir('gear-and-coin'),
	setting: listDir('setting'),
	steading: listDir('03-homefront-keep'),
};

const url = (rel) => `${BASE}/${rel.replace(/\.md$/, '.html')}`;

// ---------------------------------------------------------------------------
// Playbooks: key -> url, plus deep-link anchors for backgrounds / instinct

// Bot playbook keys (see create_wizard PLAYBOOKS) mapped to vault slugs.
const BOT_PLAYBOOK_KEYS = ['Blessed', 'Fox', 'Heavy', 'Judge', 'Lightbearer', 'Marshal', 'Ranger', 'Seeker', 'WouldbeHero'];

const playbookUrl = {};
const playbookAnchors = {};
for (const rel of groups.playbooks) {
	const slug = path.posix.basename(rel, '.md');       // the-fox
	const name = h1(read(rel)) || slug;                  // The Fox
	const key = BOT_PLAYBOOK_KEYS.find((k) => slugKey(slug) === slugKey(k));
	const u = url(rel);

	if (key) playbookUrl[key] = u;

	// Deep links: ### backgrounds and the instinct section.
	const src = read(rel);
	const backgrounds = {};
	for (const m of src.matchAll(/^###\s+(.+?)\s*$/gm)) {
		const h = m[1].replace(/\*\*/g, '').replace(/\*\(.*?\)\*\s*$/, '').replace(/\*.*?\*\s*$/, '').trim();
		backgrounds[h] = `${u}#${slugify(h)}`;
	}
	const inst = /^##\s+Instinct\b/m.test(src) ? `${u}#instinct` : null;
	const movesSec = /^##\s+Moves\b/m.test(src) ? `${u}#moves` : null;
	if (key) playbookAnchors[key] = { backgrounds, instinct: inst, moves: movesSec };
}

// ---------------------------------------------------------------------------
// Moves: normalized name -> url. Core moves + per-playbook moves.

const coreMoveUrl = {};
for (const rel of groups.coreMoves) {
	const name = titleCase(h1(read(rel)) || path.posix.basename(rel, '.md'));
	coreMoveUrl[norm(name)] = url(rel);
}

// Playbook moves keyed both by "bookKey::norm(name)" and, as a fallback,
// plain norm(name) (first playbook wins — used only when no book context).
const playbookMoveUrl = {};
const playbookMoveAny = {};
for (const rel of groups.playbookMoves) {
	const bookSlug = rel.split('/')[1];                 // the-fox
	const name = h1(read(rel)) || path.posix.basename(rel, '.md');
	const bookKey = BOT_PLAYBOOK_KEYS.find((k) => slugKey(k) === slugKey(bookSlug));
	playbookMoveUrl[`${bookKey || bookSlug}::${norm(name)}`] = url(rel);
	if (!playbookMoveAny[norm(name)]) playbookMoveAny[norm(name)] = url(rel);
}

// Legacy bot move names → canonical vault name. Keeps old saved characters
// (and any stale references) resolving after a vault rename.
const LEGACY_MOVE_ALIASES = {
	'Judge::chronicler of stonetop': 'Judge::chronicler',
};
for (const [alias, canonical] of Object.entries(LEGACY_MOVE_ALIASES)) {
	if (playbookMoveUrl[canonical] && !playbookMoveUrl[alias]) {
		playbookMoveUrl[alias] = playbookMoveUrl[canonical];
	}
	const anyKey = alias.split('::')[1];
	const anyCanonical = canonical.split('::')[1];
	if (playbookMoveAny[anyCanonical] && !playbookMoveAny[anyKey]) {
		playbookMoveAny[anyKey] = playbookMoveAny[anyCanonical];
	}
}

// ---------------------------------------------------------------------------
// Inserts, arcana, gear, setting, steading — normalized title -> url.

function titleMap(files) {
	const map = {};
	for (const rel of files) {
		const name = h1(read(rel)) || path.posix.basename(rel, '.md');
		map[norm(name.replace(/^Insert:\s*/i, ''))] = url(rel);
	}
	return map;
}

const insertUrl = titleMap(groups.inserts);
const arcanaUrl = { ...titleMap(groups.arcanaMinor), ...titleMap(groups.arcanaMajor) };
const gearUrl = titleMap(groups.gear);
const settingUrl = titleMap(groups.setting);
const steadingUrl = titleMap(groups.steading);

// ---------------------------------------------------------------------------
// Primer anchors (the core-moves list lives in HOW-TO-PLAY; traits now live
// in their own top-level page).

const primer = read('HOW-TO-PLAY.md');
// NOTE: GitHub Pages is case-sensitive; the primer ships as HOW-TO-PLAY.html.
const HOW_TO_PLAY_URL = `${BASE}/HOW-TO-PLAY.html`;
// Traits moved out of the primer into RULES/traits.md -> /traits.html.
const TRAIT_LIST_URL = `${BASE}/traits.html`;

// ---------------------------------------------------------------------------
// Emit

const j = (o) => JSON.stringify(o, null, '\t').replace(/"([^"\\]*)":/g, (m, k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? `${k}:` : `"${k}":`));

const lines = [];
lines.push('// AUTO-GENERATED by scripts/gen-site-links.js — do not edit by hand.');
lines.push('// Source: rhune-ttrpg/RULES (regenerate with: node scripts/gen-site-links.js)');
lines.push('//');
lines.push('// Links from the bot out to the public rules site (https://rhune.xyz).');
lines.push('// URL scheme mirrors the vault: RULES/<path>.md -> /<path>.html.');
lines.push('');
lines.push(`const BASE = '${BASE}';`);
lines.push('');
lines.push(`const HOW_TO_PLAY_URL = '${HOW_TO_PLAY_URL}';`);
lines.push(`const TRAIT_LIST_URL = '${TRAIT_LIST_URL}';`);
lines.push('');
lines.push(`const PLAYBOOK_URL = ${j(playbookUrl)};`);
lines.push('');
lines.push(`const PLAYBOOK_ANCHORS = ${j(playbookAnchors)};`);
lines.push('');
lines.push(`const CORE_MOVE_URL = ${j(coreMoveUrl)};`);
lines.push('');
lines.push(`const PLAYBOOK_MOVE_URL = ${j(playbookMoveUrl)};`);
lines.push('');
lines.push(`const PLAYBOOK_MOVE_ANY = ${j(playbookMoveAny)};`);
lines.push('');
lines.push(`const INSERT_URL = ${j(insertUrl)};`);
lines.push('');
lines.push(`const ARCANA_URL = ${j(arcanaUrl)};`);
lines.push('');
lines.push(`const GEAR_URL = ${j(gearUrl)};`);
lines.push('');
lines.push(`const SETTING_URL = ${j(settingUrl)};`);
lines.push('');
lines.push(`const STEADING_URL = ${j(steadingUrl)};`);
lines.push('');
lines.push('// ---------------------------------------------------------------------------');
lines.push('// Lookup helpers');
lines.push('');
lines.push(`function normalizeName(s) {`);
lines.push(`\treturn String(s == null ? '' : s).toLowerCase()`);
lines.push(`\t\t.replace(/&/g, 'and')`);
lines.push(`\t\t.replace(/[^a-z0-9]+/g, ' ')`);
lines.push(`\t\t.trim();`);
lines.push(`}`);
lines.push('');
lines.push('/** Public site URL for a playbook (by bot key, e.g. "Fox"), or null. */');
lines.push('function playbookUrl(key) {');
lines.push('\treturn PLAYBOOK_URL[key] || null;');
lines.push('}');
lines.push('');
lines.push('/** Deep-link to a playbook background section, or the playbook page. */');
lines.push('function backgroundUrl(playbookKey, backgroundName) {');
lines.push('\tconst a = PLAYBOOK_ANCHORS[playbookKey];');
lines.push('\tif (a && a.backgrounds && a.backgrounds[backgroundName]) return a.backgrounds[backgroundName];');
lines.push('\treturn playbookUrl(playbookKey);');
lines.push('}');
lines.push('');
lines.push('/** Deep-link to a playbook instinct section, or the playbook page. */');
lines.push('function instinctUrl(playbookKey) {');
lines.push('\tconst a = PLAYBOOK_ANCHORS[playbookKey];');
lines.push('\treturn (a && a.instinct) || playbookUrl(playbookKey);');
lines.push('}');
lines.push('');
lines.push('/** Deep-link to a playbook moves section, or the playbook page. */');
lines.push('function playbookMovesUrl(playbookKey) {');
lines.push('\tconst a = PLAYBOOK_ANCHORS[playbookKey];');
lines.push('\treturn (a && a.moves) || playbookUrl(playbookKey);');
lines.push('}');
lines.push('');
lines.push('/** Site URL for a move. Prefers the playbook-scoped page when known. */');
lines.push('function moveUrl(name, playbookKey) {');
lines.push('\tconst n = normalizeName(name);');
lines.push('\tif (playbookKey && PLAYBOOK_MOVE_URL[`${playbookKey}::${n}`]) return PLAYBOOK_MOVE_URL[`${playbookKey}::${n}`];');
lines.push('\treturn CORE_MOVE_URL[n] || PLAYBOOK_MOVE_ANY[n] || null;');
lines.push('}');
lines.push('');
lines.push('/** Site URL for a trait (the primer trait list), or null. */');
lines.push('function traitUrl(name) {');
lines.push('\treturn name ? TRAIT_LIST_URL : null;');
lines.push('}');
lines.push('');
lines.push('/** Site URL for an insert by name, or null. */');
lines.push('function insertUrlFor(name) { return INSERT_URL[normalizeName(name)] || null; }');
lines.push('/** Site URL for an arcanum by name, or null. */');
lines.push('function arcanaUrlFor(name) { return ARCANA_URL[normalizeName(name)] || null; }');
lines.push('/** Site URL for a gear/coin entry by name, or null. */');
lines.push('function gearUrlFor(name) { return GEAR_URL[normalizeName(name)] || null; }');
lines.push('');
lines.push('module.exports = {');
lines.push('\tBASE, HOW_TO_PLAY_URL, TRAIT_LIST_URL,');
lines.push('\tPLAYBOOK_URL, PLAYBOOK_ANCHORS, CORE_MOVE_URL, PLAYBOOK_MOVE_URL, PLAYBOOK_MOVE_ANY,');
lines.push('\tINSERT_URL, ARCANA_URL, GEAR_URL, SETTING_URL, STEADING_URL,');
lines.push('\tnormalizeName, playbookUrl, backgroundUrl, instinctUrl, playbookMovesUrl, moveUrl, traitUrl,');
lines.push('\tinsertUrlFor, arcanaUrlFor, gearUrlFor,');
lines.push('};');
lines.push('');

fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

// ---------------------------------------------------------------------------
// Report

const counts = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length]));
console.log('vault:', RULES);
console.log('pages:', JSON.stringify(counts));
console.log('playbookUrl keys:', Object.keys(playbookUrl).join(', ') || '(none)');
console.log('playbookAnchors keys:', Object.keys(playbookAnchors).join(', ') || '(none)');
console.log('core moves:', Object.keys(coreMoveUrl).length);
console.log('playbook moves:', Object.keys(playbookMoveUrl).length);
console.log('wrote', path.relative(ROOT, OUT));
