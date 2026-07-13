// Non-playbook move definitions, organized by category.
// Used by /move command for reference lookup.

const moves = {
	'Basic Moves': {
		Aid: { text: `When you call on your companion (or another ally/follower who is with you and able to act) to help you before you roll, say how they help. The GM will tell you what it costs you (time, position, attention, supplies, or putting them in danger), then choose 1:

• You gain advantage on your roll, or
• You can accomplish more than you could alone.

Either way, your companion is exposed to any risk, cost, or consequence associated with the move.` },
		Clash: { text: `When you fight in melee or close quarters, roll +STR.

On a 10+, your maneuver works as expected (deal your damage) and pick 1:
• Avoid, prevent, or counter your enemy's attack, or
• Strike hard and fast, for +1d6 damage, but suffer your enemy's attack.

On a 7–9, your maneuver works, mostly (deal your damage), but you suffer your enemy's attack. If your companion is with you and able to act, you may choose to have them share the danger: reduce the severity of the enemy's attack against you (or redirect it onto them), but they are exposed to the consequences.` },
		Defend: { text: `When you take up a defensive stance or jump in to protect yourself, your companion, or someone/something under your protection, roll +CON: on a 10+, hold 3 Readiness (or 4 if you bear a shield); on a 7-9, hold 1 Readiness (or 2 with a shield). You can spend Readiness 1-for-1 to:

• Suffer an attack's damage/effects instead of your ward
• Halve an attack's effect or damage
• Draw all attention from your ward to yourself
• Strike back at an attacker (deal your damage, with disadvantage)

When you go on the offense, cease to focus on defense, or the threat passes, lose any Readiness that you hold.

If your companion throws themself in harm's way to protect you, treat it as you Defending reactively—roll +CON and, on a hit, any Readiness you spend may instead reflect the companion taking the brunt, being pinned down, separated, injured, or otherwise exposed.` },
		'Defy Danger': { text: `When danger looms, the stakes are high, and you do something chancy, check if another move applies. If not, roll…

• … +STR to power through or test your might
• … +DEX to employ speed, agility, or finesse
• … +CON to endure or hold steady
• … +INT to apply expertise or enact a clever plan
• … +WIS to exert willpower or rely on your senses
• … +CHA to charm, bluff, impress, or fit in

On a 10+, you pull it off as well as one could hope; on a 7-9, you can do it, but the GM will present a lesser success, a cost, or a consequence (and maybe a choice between them, or a chance to back down).

On a miss, favor consequences that change the situation and drive play forward (lost time, separation, spent resources, exposure, ugly bargains), over consequences that cause hard-stops from play with no recourse.` },
		Interfere: { text: `INTERFERE (Duet)

When you try to foil your companion's (or follower's) action—or they try to foil yours—and neither of you backs down, roll…

• … +STR to power through or test your might
• … +DEX to employ speed, agility, or finesse
• … +CON to endure or hold steady
• … +INT to apply expertise or enact a clever plan
• … +WIS to exert willpower or rely on your senses
• … +CHA to charm, bluff, impress, or fit in

On a 10+, the character being interfered with picks 1:
• Do it anyway, but with disadvantage on their (next) roll
• Relent, change course, or otherwise allow their move to be foiled

On a 7-9, they still pick 1, but you are left off-balance, exposed, or otherwise vulnerable.` },
		'Know Things': { text: 'When you consult your accumulated knowledge, roll +INT: on a 10+, the GM will tell you something interesting and useful about the topic at hand; on a 7-9, the GM will tell you something interesting—it\'s on you to make it useful; either way, the GM might ask "how do you know this?"' },
		'Let Fly': { text: `When you take an easy shot with a ranged weapon, deal your damage. If the shot is tricky or you're under pressure, first roll +DEX: on a 10+, you have a clear shot, deal your damage; on a 7-9, pick 1:

• Deal your damage, but deplete your ammo (mark the next status by your weapon; don't pick this if your weapon lacks such statuses)
• Hold steady and wait for a clear shot; when the moment arrives (GM's call), deal your damage. The GM may cut to your companion, the enemy's next move, or the environment shifting while you wait.
• Move to get a clear shot—exposing yourself to danger or giving up some advantage (GM says how)—then deal your damage
• Rush the shot and deal your damage, leading to a cost or complication of the GM's choice` },
		'Persuade (vs. NPCs)': { text: `When you press or entice an NPC, say what you want them to do (or not do). If they have reason to resist, roll +CHA:

On a 10+, they either do as you want or reveal the easiest way to convince them.
On a 7-9, they reveal something you can do to convince them, though it'll likely be costly, tricky, or distasteful.` },
		'Persuade (vs. Player)': { text: `When your companion/followers press or entice you and you resist, answer: "Could they possibly get you to do this, yes or no?" If you say "no," then we let it drop. If you say "yes," you can roll +CHA:

On a 10+, you mark XP if you do what they want (but can refuse or make a counter-offer if you like).
On a 7-9, mark XP if you do what they want, and if you don't, you must say how they could convince you.` },
		'Seek Insight': { text: `When you study a situation or person, looking to the GM for insight, roll +WIS: on a 10+, ask the GM 3 questions from the list below; on a 7-9, ask 1; either way, take advantage on your next move to act on the answers.

• What happened here recently?
• What is about to happen?
• What should I be on the lookout for?
• What here is useful or valuable to me?
• Who or what is really in control here?
• What here is not what it appears to be?` },
	},
	'Special Moves': {
		'Advantage / Disadvantage': { text: `When you make a roll with advantage, roll an extra die and discard the lowest result.

When you make a roll with disadvantage, roll an extra die and discard the highest result.

When you make a roll with both advantage and disadvantage, they cancel each other out.

If you have advantage/disadvantage on a damage roll, roll the main die twice and discard the lower/higher result. Then add any bonus dice that apply.` },
		'Burn Brightly': { text: 'When you have enough XP to Level Up (6 + twice your current level), you may spend 2 XP after any roll you make to add +1 to that roll (max +1 per roll).' },
		'Death\'s Door': { text: `When you are dying, you glimpse the Last Door and the Lady of Crows (describe them). Then roll +nothing.

On a 10+, you wrest yourself back to the realm of the living—return to 1 HP and say how your brush with death has marked you.

On a 7–9, choose 1:
• You're unconscious and helpless until the immediate danger passes. When you eventually wake you are at 1 HP and you find that you have failed your current objective, and the situation has taken a turn for the worse. Discuss with the GM how bad of a spot you're in now.
• You remain at 1 HP, but something precious is lost: the GM names a cost (a memory, a bond, a prized possession, a promise, etc.)—accept it or take the first option.

On a 6-, your time has come. Choose 1:
• Make one last move as if you rolled a 12+, then step through the Last Door.
• Refuse to go; Return, but you are changed; gain the Ghost or Revenant insert (choose your Terrible Purpose).
• Call on one of the Things Below by name and beseech it to intercede; gain the Thrall insert.` },
		'Show Off': { text: `When you choose do something with a bit of extra style and/or drama just to impress someone (a follower, a companion, an NPC, or perhaps even yourself), say how you intend to show off before you roll.

If the roll succeeds with a 7-9, choose 1. If the roll succeeds with a 10+ choose two:
• Mark XP
• If you are showing off to a follower or companion who did not Aid you, Strengthen Your Bond.

On a 6-, the GM increases the severity of the outcome.` },
	},
	'Follower Moves': {
		'Order Followers': { text: `When you direct your follower to do something that would trigger a player move, and they do it, they trigger the move. If the move involves rolling, you roll for them. Instead of rolling +STAT, roll and…

… if they have at least one appropriate tag or move, add +1, or +2 if they're also exceptional;
… if they have no relevant tag or move, add +0; and
… if any of their tags would get in the way, roll with disadvantage.

When a follower is without orders or they act on their own initiative, the GM says what they do and decides how it goes.` },
		'Strengthen Your Bond': { text: `When you pay your companion or follower's cost, and you haven't done so recently, they hold +1 Loyalty (max 3).

Spend your follower's Loyalty 1-for-1 to have them:
• Overcome their fear to do as you say
• Resist acting on their instinct/tags/traits
• Do something they don't want to do (as long as it's not abhorrent or suicidal)

When a follower is without orders or they act on their own initiative, the GM says what they do and decides how it goes.` },
	},
	'Expedition Moves': {
		'Chart a Course': { text: `When you wish to travel to a distant place, name or describe your destination ("Gordin's Delve," "the hagr's lair," or "wherever these tracks lead"). If the route is unclear, tell the GM how you intend to reach it. The GM will then tell you what's required, the risks, and how long it will likely take.

When you set out on the journey, the GM will present each of the challenges one at a time—plus any surprises that you couldn't have seen coming—in whatever order makes the most sense. Address them all and reach your destination.` },
		Forage: { text: `When you spend a few hours seeking food in the wild, roll +WIS. In winter, you have disadvantage. On a 10+, pick 2; on a 7-9, pick 1:

• You acquire 4 provisions (1d6 uses)
• You acquire an extra 1d6 uses of provisions
• You discover something interesting or useful
• You avoid danger or risk (else, there is some)

Provisions can substitute for supplies when you Make Camp, 1-for-1.` },
		'Have What You Need': { text: `When you decide that you had something all along, transfer a mark (or marks) from your "undefined" inventory to a specific item or a slot. If you mark a slot, fill it with a common mundane item or something from your personal possessions.

Alternately, you can expend a use of supplies to mark an additional small item/slot.

Whatever you produce, it must be something you could have had all along. The GM or any player can veto unreasonable items.` },
		'Keep Company': { text: `When you spend a stretch of time together, choose a character present (your companion or another PC/NPC) and pick 1 question from the list below. Ask the GM and answer together (in character or out of character, as makes sense).

Then, if you want, the GM picks 1 question from the list and asks it of you or your companion.

• What do you do that's annoying/endearing?
• What do I do that you find annoying/endearing?
• Who or what seems to be on your mind?
• What do we find ourselves talking about?
• How do you/we pass the time?
• What new thing do you reveal about yourself?

Then, if you want, decide with the GM whether any of the following have occurred since the last time you Kept Company. For each "yes," mark XP.

• You demonstrated or struggled with your instinct
• Your relationship with or opinion of a PC, NPC, or group has changed
• You learned more about the world or its history
• You defeated a threat to your homestead or the region
• You improved your standing with your neighbors
• You made a lasting improvement to your homestead, or made tangible progress towards doing so?

Praise something about the game that you've enjoyed or appreciated since the last time you Kept Company.

Finally, offer up a wish for future chapters of the story: more ???, less ???, a chance to ???, handling ??? in a different way, etc. Wishes can be about what happens in the fiction or OOC. The GM will take notes.` },
		'Make Camp': { text: `When you settle in to rest in an unsafe area, answer the GM's questions about your campsite. Each member of the party must consume 1 use of supplies or provisions; if you use a mess kit (requires fire & water), then 1 use can provide for up to four people.

If you eat and drink your fill, and get at least a few hours of sleep, pick 1:

• Regain HP equal to ½ your max
• Clear a debility

If your rest was particularly peaceful, comfortable, or enjoyable, you also gain advantage on your next roll.` },
		Outfit: { text: `When you prepare for an expedition in a friendly community, mark as many on your Inventory insert as you wish to carry, either on specific items or in "undefined." Mark up to 3 for a light load (quick and quiet), 4-6 for a normal load, or 7-9 for heavy load (noisy, slow, quick to tire). Also, mark a number of small items equal to 4+Prosperity (on specific items or in "undefined").

You can select…
• Items listed in your playbook's Inventory section
• Other common, mundane items
• Any of your personal possessions
• Special items for which you Trade & Barter

Tell the GM what you're bringing, and answer their questions about your gear and where you got it.` },
		Recover: { text: `When you take time to catch your breath and tend to what ails you, expend 1 use of supplies and recover HP equal to 4+Prosperity. You can't gain this benefit again until you take more damage.

When you tend to a debility or a problematic wound, say how. The GM will either say that it's taken care of or tell you what's required to do so (Defying Danger, expending supplies or some other resource, finding ???, Making Camp, etc.).` },
		Requisition: { text: 'When you borrow some of the steading\'s assets for an expedition (like the horses or a plow), roll +Fortunes: on a 10+, go ahead, but bring it back safely; on a 7-9, you\'ll need to do some convincing; on a 6-, don\'t mark XP - you can take the asset with you if you want, but if you do, reduce Fortunes by 1.' },
		'Return Triumphant': { text: 'When you return home in triumph, having saved your fellows, put down the threat, seized the opportunity, etc., then clear one of the steading\'s debilities (diminished, lacking, or malcontent). If the steading has no debilities marked, then increase Fortunes by 1.' },
	},
	'Homefront Moves': {
		Bolster: { text: `When you prepare for what's coming or seek spiritual favor, say how and answer the GM's questions. Then, hold Preparation based on the amount of time you devote:

• A week or so: 1 Preparation
• A month or so: 2 Preparation
• The better part of a season: 3 Preparation

When you make any roll to which your efforts might apply, you may spend 1 Preparation to add +1 to that roll, after it is made (maximum +1 per roll).` },
		Convalesce: { text: 'When you rest for a few days in safety and comfort, set your HP back to your max and clear all your debilities. When you rest for a few weeks under the care of a healer, you heal any problematic wounds that can heal. If you have suffered a permanent injury or impairment, either retire or Make a Plan to adapt to it.' },
		Deploy: { text: `When you send a steading's people into danger or rally them against an attack, roll +Defenses: on a 10+, it goes as well as can be expected; on a 7-9, it works but someone chooses 1 from the list below. If the steading is acting from a position of strength, you choose. Otherwise, the GM chooses.

• It's less effective than you expected
• Injuries abound; the steading marks diminished (disadvantage to Deploy, Muster, Pull Together)
• The GM picks a named NPC involved in the action; they die` },
		'Level Up': { text: `When you have a quiet stretch of time at home and XP equal to (or greater than) 6 + twice your current level, follow these steps:

1) Subtract 6 + twice your current level from your XP.
2) Increase your level by 1.
3) Choose a new move from your playbook, or an insert class that you've unlocked.
4) If you are the Blessed (or have a sacred pouch) and your new level is even, increase your max Stock by 1.
5) If you are the Lightbearer (or have Invoke the Sun God) and your new level is even, choose a new invocation.
6) Review your Instinct and Appearance. Change anything that no longer applies. Feel free to make up new options.` },
		'Make a Plan': { text: 'When you wish to accomplish some project but aren\'t sure how to go about it, tell the GM what you hope to achieve. They\'ll say what\'s required. If you\'re stumped on how to accomplish one of the requirements, tell the GM and Make a Plan for that.' },
		'Meet with Disaster': { text: `When calamity befalls the steading or panic spreads, reduce Fortunes by 1 (min -1).

If Fortunes would drop below -1 for any reason (not just calamity or panic), then the GM picks 1 instead:

• The steading marks diminished from injuries/sickness/doubt (disadvantage to Deploy, Muster, Pull Together)
• The steading marks lacking due to shortages/hoarding/distrust (treat Prosperity as 1 lower)
• The steading marks malcontent from fear/anger/despair (Fortunes reset to +0 each season, not +1; folks need Persuading more often than usual)
• Folks start to leave; reduce Population by 1` },
		Muster: { text: `When you press every able body into the defense of a steading, reduce Fortunes by 1 and roll +Population: on a 7+, the steading is alert and ready for action until the threat passes, the Seasons Change, or you cease to oversee the muster. On a 10+, also pick 2; on a 7-9, also pick 1.

• Everyone's willing to pitch in; don't reduce Fortunes after all
• The muster holds together even without your presence
• 1 or 2 individuals show real potential; ask the GM who and how` },
		'Pull Together': { text: `When you set a community to work on improvements, to secure new resources, or to make major repairs, spend whatever the GM says is required (time, material, Surplus, etc.) and roll +Population: on a 10+, the job gets done; on a 7-9, pick 1:

• It gets done, but other work doesn't; reduce Fortunes by 1
• It gets done, but the work is shoddy, crude
• It gets done, but there's a consequence (bad blood, an injury, a threat unearthed, etc.)
• There's an unforeseen cost, requirement, or challenge; address it and the job gets done` },
		'Seasons\' Change': { text: `🌱 When spring bursts forth, say something either you or your companion is hopeful for, then roll +Fortunes: on a 10+, pick 1 seasonal gain; on a 7-9, pick 1 seasonal gain, but a threat to the steading makes itself known or gets worse; on a 6-, threats abound (and don't mark XP). Reset Fortunes to +1.

☀️ When the hot days of summer settle, say something either you or your companion is content with, then roll +Fortunes: on a 10+, pick 2 seasonal gains; on a 7-9, pick 1 seasonal gain; on a 6-, a threat makes itself known or gets worse (don't mark XP). The steading generates 1d4-1 Surplus. Reset Fortunes to +1.

🍂 When autumn falls, say something either you or your companion is determined about, then roll +Fortunes: on a 10+, pick 1 seasonal gain; on a 7-9, pick 1 seasonal gain, but a threat makes itself known or gets worse; on a 6-, threats abound (don't mark XP). Reset Fortunes to +1. When harvest is complete, roll 1d4; the steading generates that much Surplus.

❄️ When winter grips the land, say something that makes either you or your companion weary, then roll 1d4+Population; the steading consumes that much Surplus. If not enough, reduce Surplus to 0 and Meet with Disaster. Then, pick 1: reduce Population by 1, an important resource is lost, an important NPC dies, or your PC dies/leaves/retires. Then roll +Fortunes: on a 10+, mild winter; on a 7-9, consume additional Surplus before winter ends; on a 6-, threats abound. Reset Fortunes to +1.` },
		'Trade & Barter': { text: `When you wish to acquire or sell a commonly available item, you can. When you seek to acquire or sell a special item, roll +Prosperity and subtract the item's Value. In winter, you have disadvantage. On a 10+, you can get it or sell it for a fair price; on a 7-9 when buying, the GM picks 1:

• You can get it, but it'll cost more than usual
• ??? has it, but they aren't keen to give it up
• You can get something close, but not quite right

On a 7-9 when selling: you can sell it now, but you won't get its full worth.

On a 6- either way, don't mark XP. If you want to acquire/sell it, you'll need to travel to ??? or wait until next season.

For unique or truly exceptional items, don't Trade & Barter. Either get with the GM and Make a Plan or wait for a trade opportunity when Seasons Change.` },
	},
};

const categoryNames = [
	'Basic Moves',
	'Special Moves',
	'Follower Moves',
	'Expedition Moves',
	'Homefront Moves',
];

const emojiLabels = {
	'Basic Moves': '⚔️ Basic Moves',
	'Special Moves': '✨ Special Moves',
	'Follower Moves': '👥 Follower Moves',
	'Expedition Moves': '🗺️ Expedition Moves',
	'Homefront Moves': '🏠 Homefront Moves',
};

/**
 * Get the display name for a category (with emoji).
 */
function getCategoryLabel(cat) {
	return emojiLabels[cat] || cat;
}

/**
 * Look up a specific move by category and name.
 */
function getMove(category, name) {
	return moves[category]?.[name] || null;
}

/**
 * List all moves in a category.
 * Returns [{ name, text }].
 */
function listMoves(category) {
	const cat = moves[category];
	if (!cat) return [];
	return Object.entries(cat).map(([name, data]) => ({ name, text: data.text }));
}

/**
 * Build section-navigation dropdown for move categories.
 */
function buildMoveNav() {
	const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
	const select = new StringSelectMenuBuilder()
		.setCustomId('rhune:move:pickcategory')
		.setPlaceholder('Jump to category…')
		.setMinValues(1)
		.setMaxValues(1);

	categoryNames.forEach(cat => {
		select.addOptions(
			new StringSelectMenuOptionBuilder()
				.setLabel(getCategoryLabel(cat))
				.setValue(cat),
		);
	});

	return new ActionRowBuilder().addComponents(select);
}

/**
 * Build a dropdown for all moves within a category.
 */
function buildMovePicker(category) {
	const { ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
	const catMoves = listMoves(category);
	if (!catMoves.length) return null;

	const select = new StringSelectMenuBuilder()
		.setCustomId(`rhune:move:pickmove:${category}`)
		.setPlaceholder('Select a move to view…')
		.setMinValues(1)
		.setMaxValues(1);

	catMoves.forEach(m => {
		select.addOptions(
			new StringSelectMenuOptionBuilder()
				.setLabel(m.name)
				.setValue(m.name),
		);
	});

	return new ActionRowBuilder().addComponents(select);
}

module.exports = {
	moves,
	categoryNames,
	getCategoryLabel,
	getMove,
	listMoves,
	buildMoveNav,
	buildMovePicker,
};
