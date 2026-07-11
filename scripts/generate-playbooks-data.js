/**
 * This script generates lib/playbooks.js from the vault playbook files.
 * Usage: node scripts/generate-playbooks-data.js
 */
const fs = require('fs');
const path = require('path');

const VAULT = path.join(__dirname, '..', '..', 'rhune-ttrpg', 'Mechanics', 'Playbooks');
const OUT = path.join(__dirname, '..', 'lib', 'playbooks.js');

const files = ['Blessed', 'Fox', 'Heavy', 'Judge', 'Lightbearer', 'Marshal', 'Ranger', 'Seeker', 'Would-be-Hero'];

// Read all playbook markdown
const playbookData = {};
for (const name of files) {
	playbookData[name] = fs.readFileSync(path.join(VAULT, `The-${name}.md`), 'utf8');
}

// Now generate the playbooks.js content
const out = `const playbooks = {};

// ===== Helpers =====

function keyOf(raw) {
\tif (!raw) return null;
\tconst n = String(raw).trim().toLowerCase().replace(/^(the |the-)/, '').replace(/[^a-z0-9]/g, '');
\tfor (const k of Object.keys(playbooks)) {
\t\tconst clean = k.replace(/[^a-z0-9]/g, '');
\t\tif (clean === n) return k;
\t}
\treturn null;
}

function lookupPlaybook(rawName) {
\tconst k = keyOf(rawName);
\treturn k ? playbooks[k] : null;
}

function renderPlaybookEmbed(record) {
\tconst pb = lookupPlaybook(record.playbook);
\tif (!pb) return null;

\tconst { EmbedBuilder } = require('discord.js');
\tconst embed = new EmbedBuilder()
\t\t.setTitle(\`\${record.name} — \${pb.name}\`)
\t\t.setDescription(pb.tagline)
\t\t.addFields(
\t\t\t{
\t\t\t\tname: 'Backgrounds',
\t\t\t\tvalue: Object.keys(pb.backgrounds).map(b => \`• \${b}\`).join('\\\\n'),
\t\t\t\tinline: false,
\t\t\t},
\t\t\t{
\t\t\t\tname: 'Starting Moves',
\t\t\t\tvalue: Object.keys(pb.startingMoves).map(m => \`• \${m}\`).join('\\\\n'),
\t\t\t\tinline: false,
\t\t\t},
\t\t\t{
\t\t\t\tname: 'Instincts',
\t\t\t\tvalue: Object.entries(pb.instincts).map(([k, v]) => \`• **\${k}** — \${v}\`).join('\\\\n'),
\t\t\t\tinline: false,
\t\t\t},
\t\t)
\t\t.setFooter({ text: \`Sheet for \${record.name}\` })
\t\t.setTimestamp(new Date());
\treturn embed;
}

function getStartingMovePool(playbookKey) {
\tconst pb = lookupPlaybook(playbookKey);
\tif (!pb) return {};
\treturn pb.startingMoves || {};
}

module.exports = {
\tlookupPlaybook,
\trenderPlaybookEmbed,
\tgetStartingMovePool,
};

`;

fs.writeFileSync(OUT, out);
console.log('Wrote preamble to', OUT);
