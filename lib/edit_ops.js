// Edit operations for the sheet's Edit view.
//
// Pure record -> patch helpers (no Discord, no PocketBase) so they stay
// unit-testable. Each returns { patch, message } on success or { error } on a
// validation failure. The handler layer owns fetching, ownership checks, and
// persistence.

const { getTraits, withTraits, traitFromCatalog } = require('./traits');
const { lookupPlaybook, getCharacterMoveList, parseChoices } = require('./playbooks');

// Characters start with 2 traits, but earned traits exist in play (moves and
// backgrounds can grant them), so editing allows growing past the creation
// cap. This is just a sanity ceiling against accidents.
const MAX_TRAITS = 6;
const MIN_MAX_HP = 1;
const MAX_MAX_HP = 30;

function clamp(value, lo, hi) {
	return Math.max(lo, Math.min(hi, value));
}

// Adjust max HP by +/-1. Current HP is capped down if it exceeds the new max.
function adjustMaxHp(record, delta) {
	const currentMax = typeof record.hp_max === 'number' ? record.hp_max : 0;
	const newMax = clamp(currentMax + delta, MIN_MAX_HP, MAX_MAX_HP);
	if (newMax === currentMax) {
		return { error: `Max HP is already ${delta > 0 ? 'at the ceiling' : 'at the floor'} (${currentMax}).` };
	}
	const patch = { hp_max: newMax };
	if (typeof record.hp === 'number' && record.hp > newMax) {
		patch.hp = newMax;
	}
	return { patch, message: `Max HP: ${currentMax} -> ${newMax}` };
}

// Add a catalog trait by name.
function addTrait(record, name) {
	const traits = getTraits(record);
	if (traits.length >= MAX_TRAITS) {
		return { error: `**${record.name}** already has ${MAX_TRAITS} traits - remove one first.` };
	}
	const trait = traitFromCatalog(name);
	if (!trait) {
		return { error: `No catalog trait named **${name}**.` };
	}
	if (traits.some(t => t.name.toUpperCase() === trait.name.toUpperCase())) {
		return { error: `**${record.name}** already has **${trait.name}**.` };
	}
	return {
		patch: { choices: withTraits(record, [...traits, trait]) },
		message: `Added trait **${trait.name}**.`,
	};
}

// Add a freeform custom trait (name + text typed by the player).
function addCustomTrait(record, name, text) {
	const traits = getTraits(record);
	if (traits.length >= MAX_TRAITS) {
		return { error: `**${record.name}** already has ${MAX_TRAITS} traits - remove one first.` };
	}
	const cleanName = String(name || '').trim().slice(0, 80);
	const cleanText = String(text || '').trim().slice(0, 1000);
	if (!cleanName) return { error: 'Custom traits need a name.' };
	if (!cleanText) return { error: 'Custom traits need rules text.' };
	if (traits.some(t => t.name.toUpperCase() === cleanName.toUpperCase())) {
		return { error: `**${record.name}** already has a trait named **${cleanName}**.` };
	}
	const trait = { name: cleanName, text: cleanText, improved: false, superior: false };
	return {
		patch: { choices: withTraits(record, [...traits, trait]) },
		message: `Added custom trait **${trait.name}**.`,
	};
}

// Remove a trait by name.
function removeTrait(record, name) {
	const traits = getTraits(record);
	const target = String(name || '').trim();
	const found = traits.find(t => t.name === target);
	if (!found) {
		return { error: `**${record.name}** doesn't have a trait named **${target}**.` };
	}
	return {
		patch: { choices: withTraits(record, traits.filter(t => t.name !== target)) },
		message: `Removed trait **${found.name}**.`,
	};
}

// Add a playbook move. Restricted to the character's own playbook.
function addMove(record, moveName) {
	const pb = lookupPlaybook(record.playbook);
	if (!pb) {
		return { error: `**${record.name}** has no playbook - moves can't be edited.` };
	}
	const all = pb.allMoves || {};
	if (!all[moveName]) {
		return { error: `**${moveName}** isn't a ${pb.name} move.` };
	}
	const current = getCharacterMoveList(record, pb);
	if (current.includes(moveName)) {
		return { error: `**${record.name}** already has **${moveName}**.` };
	}
	const choices = parseChoices(record.choices);
	return {
		patch: { choices: { ...choices, chosen_moves: [...current, moveName] } },
		message: `Added move **${moveName}**.`,
	};
}

// Remove a move by name.
function removeMove(record, moveName) {
	const pb = lookupPlaybook(record.playbook);
	const current = getCharacterMoveList(record, pb);
	if (!current.includes(moveName)) {
		return { error: `**${record.name}** doesn't have **${moveName}**.` };
	}
	const choices = parseChoices(record.choices);
	return {
		patch: { choices: { ...choices, chosen_moves: current.filter(m => m !== moveName) } },
		message: `Removed move **${moveName}**.`,
	};
}

module.exports = {
	adjustMaxHp,
	addTrait,
	addCustomTrait,
	removeTrait,
	addMove,
	removeMove,
	MAX_TRAITS,
	MIN_MAX_HP,
	MAX_MAX_HP,
};
