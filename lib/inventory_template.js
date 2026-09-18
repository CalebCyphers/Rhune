// Base inventory template for /outfit.
// Intentionally human-first: the bot does not parse this text.
// Users can structure it however they like as long as it fits Discord limits.

function buildOutfitTemplate({ characterName }) {
	return `# Inventory for ${characterName}

When you **Outfit**, mark boxes below on specific items or Undefined.
- Light load (quick & quiet): up to 3 boxes
- Normal load: 4–6 boxes
- Heavy load (noisy, slow, hot, quick to tire): 7–9 boxes

Undefined [ ] [ ] [ ]  [ ] [ ] [ ]  [ ] [ ] [ ]
When you **Have What You Need**, move marks from here to boxes below

[ ] Supplies (4+Prosperity uses)
[ ] More supplies (4+Prosperity uses)
[ ] Even more supplies (4+Prosperity uses)
Use supplies to Recover, Make Camp, or have extra small items.

[ ] Mess kit (requires fire & water; makes Supplies last longer)
[ ] Bedroll (recover 1d6 extra HP when you Make Camp)
[ ] Blanket (warm)
[ ] Change of clothes
[ ] Rope, ~25ft
[ ] Shovel
[ ][ ] Sledge/litter/travois, roll-out
[ ] Snow-shoes

[ ] Torch (lasts ~1 hour; *reach*, *area*, *dangerous*)
[ ] Oil lamp (3 hours, *close*, *area*, *crude*)
[ ] Extra oil (5 hours, for lamp/lantern, useless as a weapon)
[ ][ ] Firewood (enough to last 1 full night, *reach*, *area*)

[ ] Hatchet, iron (hand, thrown, x piercing)
[ ] Mallet, iron and/or wood (hand)
[ ] Mattock, iron (close, x piercing, messy, awkward)
[ ][ ] Maul, iron (close, forceful, awkward)
[ ] Staff (close)
[ ] Spear, iron (close, thrown, x piercing)
[ ][ ] Long spear, iron (reach, x piercing)
[ ] Bow & iron arrows (near, x piercing)
[ ] Extra arrows (x piercing)
[ ] Javelins, a few, iron (thrown, x piercing, +1 damage)

[ ][ ] Shield (+1 armor, +1 Readiness on a 7+ to Defend)
[ ][ ] Thick hides (1 armor, warm)
[ ] Cloak (warm)

Possessions, items, loot:
[ ] ___
[ ] ___
[ ] ___
[ ] ___
[ ] ___
[ ][ ] ___
[ ][ ] ___

Other things (animals, kits, stashed items, etc.):

## Small Items
Fit in a pocket, pouch, or boot.

When you **Outfit** mark circles (shown as "o") below equal to 4+Prosperity

Undefined: o o o o o o
When you **Have What You Need**, move marked circles from here to items below, or expend supplies to mark an additional circle

o Knife or dagger, iron (hand)
o Sling (near, reload, awkward)
o Rushlight (lasts ~15-30 minutes, hand, crude)
o Tinderbox (slow)
o Needle & thread
o Handful of coppers
o Whisky, skin (2 uses)

o Awl
o Bowstring
o Chalk
o Charcoal
o Clay jar
o Cloth/rag
o Comb
o Cup
o Extra socks
o Gloves
o Little box
o Sack (empty)
o Sawdust
o Tallow
o Twine/cord
o Waterskin
o Whetstone
o Whistle

o ___
o ___
o ___
o ___
o ___
o ___
o ___

## Prosperity
- [ ] -1 Gear is *crude*
- [ ] +0
- [ ] +1 x=1 piercing
- [ ] +2 x=2 piercing
- [ ] +3 x=3 piercing
`;
}

module.exports = {
	buildOutfitTemplate,
};
