// Trait helpers.
//
// Traits are the whole character layer (Rhune is stat-less). A character's
// traits live in the record's `choices` JSON blob under `traits`, as an array
// of { name, text, improved, superior }. Players own their copy — they may
// rename a trait or rewrite its text — so we never treat the catalog as
// authoritative once a trait is on a character.

const { TRAIT_BY_NAME } = require('./traits_data');

/** Parse a record's choices blob (string or object) into an object. */
function parseChoices(raw) {
	let choices = raw || {};
	if (typeof choices === 'string') {
		try { choices = JSON.parse(choices); }
		catch { choices = {}; }
	}
	return choices;
}

/** Return the character's traits as a normalized array. */
function getTraits(record) {
	const choices = parseChoices(record?.choices);
	const arr = Array.isArray(choices.traits) ? choices.traits : [];
	return arr.map(t => ({
		name: String(t.name ?? '').trim(),
		text: String(t.text ?? '').trim(),
		improved: !!t.improved,
		superior: !!t.superior,
	}));
}

/** Return a new choices object with the traits array replaced. */
function withTraits(record, traits) {
	const choices = parseChoices(record?.choices);
	return { ...choices, traits };
}

/** Build a trait object from the catalog by name (or null). */
function traitFromCatalog(name) {
	const t = TRAIT_BY_NAME[String(name || '').trim().toUpperCase()];
	if (!t) return null;
	return { name: t.name, text: t.text, improved: false, superior: false };
}

/** A short display line for a trait, e.g. "CATFALL — You always land on your feet…". */
function traitLine(t) {
	const marks = [t.improved ? '★ Improved' : null, t.superior ? '★★ Superior' : null].filter(Boolean).join(' · ');
	return marks ? `${t.name} *(${marks})*` : t.name;
}

module.exports = {
	parseChoices,
	getTraits,
	withTraits,
	traitFromCatalog,
	traitLine,
};
