// Base inventory template for /outfit.
// Intentionally human-first: the bot does not parse this text.
// Users can structure it however they like as long as it fits Discord limits.
// Rendered as plain Discord markdown (not a code block) for a cleaner look.
// Compact enough to fit in a normal Discord message (<= 2000 chars).

function buildOutfitTemplate() {
	// The base template is character-agnostic (no name placeholder needed).
	return `**When you Outfit**, mark ☑ on items or Undefined:
- Light (≤3 ☑ — quick & quiet)
- Normal (4–6 ☑)
- Heavy (7–9 ☑ — noisy, slow, hot, quick to tire)

**Prosperity (determines x):** +0

### Undefined
☐ ☐ ☐ / ☐ ☐ ☐ / ☐ ☐ ☐
_When you **Have What You Need**, move ☑ from here → below_

☐ Supplies (4+Prosperity uses)
☐ More supplies (4+Prosperity uses)
☐ Even more supplies (4+Prosperity uses)
_Use supplies to Recover, Make Camp, or have extra small items._

☐ Mess kit (needs fire & water — makes Supplies last longer)
☐ Bedroll (recover +1d6 HP when you Make Camp)
☐ Blanket (warm)
☐ Change of clothes
☐ Rope, ~25ft
☐ Shovel
☐ Sledge/litter/travois, roll-out
☐ Snow-shoes

☐ Torch (1 hr · reach · area · dangerous)
☐ Oil lamp (3 hr · close · area · crude)
☐ Extra oil (5 hr · lamp only — useless as weapon)
☐☐ Firewood (1 full night · reach · area)

☐ Hatchet, iron (hand, thrown, x pierce)
☐ Mallet, iron/wood (hand)
☐ Mattock, iron (close, x pierce, messy, awkward)
☐☐ Maul, iron (close, forceful, awkward)
☐ Staff (close)
☐ Spear, iron (close, thrown, x pierce)
☐☐ Long spear, iron (reach, x pierce)

☐ Bow & iron arrows (near, x pierce)
☐ Extra arrows (x pierce)
☐☐ Javelins, a few, iron (thrown, x pierce, +1 damage)

☐☐ Shield (+1 armor, +1 Readiness on a 7+ to Defend)
☐☐ Thick hides (1 armor, warm)
☐ Cloak (warm)

**Possessions, items, loot**
☐ ???
☐ ???

**Other** _(animals, kits, stashed items, etc.):_

## Small Items
*(fit in pocket/pouch/boot)*
_When you **Outfit**, mark ☑ = **4 + Prosperity**_
### Undefined:
☐ ☐ ☐ ☐
_When you **Have What You Need**, move ☑ here → below, or spend supplies to mark +1 ☑_

☐ Knife or dagger, iron (hand)
☐ Sling (near, reload, awkward)
☐ Rushlight (15–31 min · hand · crude)
☐ Tinderbox (slow)
☐ Needle & thread
☐ Handful of coppers

Other small Items:
☐ ???
☐ ???
`;
}

module.exports = {
	buildOutfitTemplate,
};
