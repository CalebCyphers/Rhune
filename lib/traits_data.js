// Trait catalog — auto-generated from rhune-ttrpg RULES/HOW-TO-PLAY.md.
// Traits are the whole character layer (Rhune is stat-less). Each is a
// named, evocative power. Players pick 2 at creation and may edit their own copy.

const species = {
	"Bovine": {
		flavor: "cattle, bison — sturdy, patient, enduring, stubborn",
		traits: [
			{ name: "UNSHAKEABLE", text: "You plant your feet and don't move. You cannot be moved, knocked down, or pushed back by a shove, charge, or current — **no roll needed.**" },
			{ name: "HERD SENSE", text: "You read a crowd like weather. When you **Seek Insight** about a group's mood, tension, or who's about to bolt, ask **one extra question** — even on a bust." },
		],
	},
	"Canine": {
		flavor: "wolves, dogs — pack, loyalty, scent, tireless",
		traits: [
			{ name: "KEEN NOSE", text: "Your nose knows. When you **Seek Insight** by scent or track, you can ask *\"What happened here recently?\"* for free, even on a bust." },
			{ name: "PACK TACTICS", text: "You fight best beside an ally. When you **Clash** while a friend is engaged with the same foe, you may **increment one die in the roll by 1**." },
		],
	},
	"Celerine": {
		flavor: "rabbits, squirrels — quick, jumpy, nimble, hoarding",
		traits: [
			{ name: "STARTLE", text: "You're all nerves, and it keeps you alive. The first time a threat appears in a scene, you may **move, hide, or flee** before it resolves — **no roll needed.**" },
			{ name: "CACHE", text: "You've stashed things all over yourself. When you **Have What You Need** for a small item, you may **reroll the d4** to see if you can skip the Preparation cost — you had it tucked away somewhere on your person all along." },
		],
	},
	"Cervine": {
		flavor: "elk — alert, majestic, wary, swift",
		traits: [
			{ name: "SWIVEL EARS", text: "Nothing gets past you. You notice anything approaching before it becomes a threat — **no roll needed** — and you can hear a whisper across a quiet room." },
			{ name: "BOUNDING STRIDE", text: "You cover ground like the wind. When you **Defy Danger** by fleeing or leaping, you may **increment one die in the roll by 1**." },
		],
	},
	"Equine": {
		flavor: "horses, donkeys — strong, enduring, sure-footed, stubborn",
		traits: [
			{ name: "LONG STRIDE", text: "You can travel farther and longer than anyone. When a journey requires you to **Defy Danger** through sheer endurance, you may **increment one die in the roll by 1**." },
			{ name: "PACK MULE", text: "You carry the weight so others don't have to. You may take the **Heavy Load** when you **Outfit** and ignore its drawbacks — you stay quick and quiet despite the burden." },
		],
	},
	"Feline": {
		flavor: "cats, big cats — stealth, grace, night, claws",
		traits: [
			{ name: "CATFALL", text: "You always land on your feet. **Once per session**, when you fall, are thrown, or would take damage from a fall or collapse, take **no damage** and land steady." },
			{ name: "SOFT PAWS", text: "You move without sound. When you move with care, you leave no trace and make no noise, and you can slip into shadow unseen unless something is actively searching for you." },
		],
	},
	"Laetine": {
		flavor: "ferrets, otters — playful, agile, swimming, tunnelling, thieving",
		traits: [
			{ name: "SLIPPERY", text: "You're impossible to hold. When you're grabbed, grappled, or confined, you can **mark a debility** to slip free immediately." },
			{ name: "WATER-RAT", text: "You're at home in the water. You swim as easily as you walk, hold your breath **twice as long**, and may **increment one die in the roll by 1** when you **Defy Danger** in or around water." },
		],
	},
	"Ligonine": {
		flavor: "moles, armadillos, sloths — digging, armor, patience, the deep places",
		traits: [
			{ name: "BURROWER", text: "You dig like the earth wants you to. Given time, you can tunnel through soil and loose rock — **no roll needed** — and you always know which way is up and where you came from underground." },
			{ name: "THICK HIDE", text: "You're armored where it counts. Gain **+1 armor**." },
		],
	},
	"Murine": {
		flavor: "mice, rats — small, quick, sneaky, resourceful",
		traits: [
			{ name: "SQUEEZE", text: "You fit where no one else can. You can slip through any gap **wider than your head** — no roll needed." },
			{ name: "CHEW", text: "You gnaw through anything softer than iron given a little time — rope, wood, leather, even thin bars. **No roll needed.**" },
		],
	},
	"Ovine": {
		flavor: "sheep — hardy, gentle, warm, long-memoried",
		traits: [
			{ name: "WARM AS WOOL", text: "You endure the cold. You're never bothered by cold weather, and when you **Make Camp** in the cold, everyone with you is warmer for it." },
			{ name: "FLOCK MEMORY", text: "You have a memory for faces. You never forget a face you've met; when you **Seek Insight** about someone you've met before, ask **one extra question**." },
		],
	},
	"Tenebrine": {
		flavor: "raccoons, possums — clever, dexterous, night-dwellers, scavengers",
		traits: [
			{ name: "CLEVER PAWS", text: "Your hands are quick and sure. You can pick a lock, palm an object, or work a knot — all without being noticed." },
			{ name: "NIGHT EYES", text: "You see in the dark. You see by starlight or embers as well as by day, and you may **increment one die in the roll by 1** when you **Defy Danger** in darkness." },
		],
	},
	"Ursine": {
		flavor: "bears — strong, fierce, deep-sleeping, long-memoried",
		traits: [
			{ name: "CRUSHING GRIP", text: "You grab and don't let go. When you get your hands on a foe, they must **break free before they can act**, and you deal **+1d4 damage** while you hold them." },
			{ name: "POWER NAP", text: "You can sleep anywhere, any time, and wake ready. A few hours counts as a full night for you, and nothing short of real danger wakes you." },
		],
	},
	"Vulpine": {
		flavor: "foxes — clever, cunning, quick, sly",
		traits: [
			{ name: "CUNNING", text: "You always have an angle. When you **Persuade** by offering a clever deal or a half-truth, you may **increment one die in the roll by 1**." },
			{ name: "BRUSH", text: "You're hard to pin down. When you **Defend** by staying light and evasive, you can spend **1 Readiness** to slip out of reach entirely — no attack lands this exchange." },
		],
	},
	"Bat": {
		flavor: "echolocation, flight, caves, hanging",
		traits: [
			{ name: "ECHO", text: "When you **tap a surface, snap your fingers, or clap**, you hear the shape of the world around you — in darkness, you know where everything is within earshot. **No roll needed**, but you must make a sound to \"see.\"" },
			{ name: "CLIMB", text: "You can cling to and climb almost any surface, and sleep practically anywhere. You are extremely difficult to dislodge." },
		],
	},
	"Dragon": {
		flavor: "flight, claws, fang, pride",
		traits: [
			{ name: "WINGS", text: "You have wings, and you can fly. You take to the air as easily as you walk — **no roll needed** — though not in a tight space, and not while carrying more than a light load." },
			{ name: "NATURAL WEAPONS", text: "You are a natural killer. When you **Clash** and would gain 1d6 bonus damage, gain **1d8 bonus damage** instead." },
		],
	},
	"Kobold": {
		flavor: "small, scaled, tireless, cold, opportunistic",
		traits: [
			{ name: "OPPORTUNIST", text: "You strike when they're weak. When you attack a foe who's already hurt, distracted, or fleeing, deal **+1d4 damage**." },
			{ name: "COLD-BLOODED", text: "You don't tire like warm-bloods. You can go **days without sleep** without penalty, and heat never bothers you." },
		],
	},
};

const SPECIES_ORDER = ["Bovine", "Canine", "Celerine", "Cervine", "Equine", "Feline", "Laetine", "Ligonine", "Murine", "Ovine", "Tenebrine", "Ursine", "Vulpine", "Bat", "Dragon", "Kobold"];

// Flat lookup: trait name -> { name, text, species }.
const TRAIT_BY_NAME = {};
for (const sp of SPECIES_ORDER) {
	for (const t of species[sp].traits) {
		TRAIT_BY_NAME[t.name] = { ...t, species: sp };
	}
}

const TRAIT_NAMES = Object.keys(TRAIT_BY_NAME);

module.exports = { species, SPECIES_ORDER, TRAIT_BY_NAME, TRAIT_NAMES };
