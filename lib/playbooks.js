const playbooks = {};

const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');

function keyOf(raw) {
	if (!raw) return null;
	const n = String(raw).trim().toLowerCase().replace(/^(the[ -]?)/, '').replace(/[^a-zA-Z0-9]/g, '');
	for (const k of Object.keys(playbooks)) {
		const clean = k.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
		if (clean === n) return k;
	}
	return null;
}

function lookupPlaybook(rawName) {
	const k = keyOf(rawName);
	return k ? playbooks[k] : null;
}

function parseChoices(raw) {
	let choices = raw || {};
	if (typeof choices === 'string') {
		try {
			choices = JSON.parse(choices);
		}
		catch {
			choices = {};
		}
	}
	return choices;
}

function getCharacterMoveList(record, pb) {
	const choices = parseChoices(record.choices);

	// Source of truth is character choices, but if older characters exist,
	// fall back to what we can infer.
	let moves = [];
	if (Array.isArray(choices.chosen_moves)) {
		moves = choices.chosen_moves.slice();
	}
	else if (typeof choices.chosen_moves === 'string' && choices.chosen_moves.trim().length) {
		moves = [choices.chosen_moves.trim()];
	}

	// If choices are missing, at least show starting moves (so playbook view isn’t empty).
	if (!moves.length && pb?.startingMoves) {
		moves = Object.keys(pb.startingMoves);
	}

	// De-dupe, keep order.
	const seen = new Set();
	const out = [];
	for (const m of moves) {
		const k = String(m);
		if (!k || seen.has(k)) continue;
		seen.add(k);
		out.push(k);
	}
	return out;
}

/**
 * Get first meaningful line of a move's text as a preview.
 * Skips requirement lines like *(Requires ...)* and --- separators.
 */
/**
 * Render a single section of a playbook.
 * @param {Object} record - character record
 * @param {string} [section='overview'] - 'overview' | 'background' | 'instinct' | 'moves'
 * @returns {EmbedBuilder|null}
 */
function renderPlaybookEmbed(record, section) {
	section = section || 'overview';
	const pb = lookupPlaybook(record.playbook);
	if (!pb) return null;

	const choices = parseChoices(record.choices);
	const chosenBackground = choices.background || null;
	const chosenInstinct = choices.instinct || null;
	const chosenMoves = getCharacterMoveList(record, pb);
	const die = pb.creationRules?.die || '—';

	const sectionLabels = { overview: '📋 Overview', background: '📜 Background', instinct: '💭 Instinct', moves: '⚔️ Moves' };
	const sectionTitle = sectionLabels[section] || section;

	let embed;

	switch (section) {
	case 'overview': {
		const moveList = chosenMoves.length
			? chosenMoves.map(m => `• ${m}`).join('\n')
			: '—';
		embed = new EmbedBuilder()
			.setTitle(`${sectionTitle} — ${record.name}`)
			.setDescription(pb.tagline)
			.addFields(
				{ name: 'Damage Die', value: `\`${die}\``, inline: true },
				{ name: 'Background', value: chosenBackground || '—', inline: true },
				{ name: 'Instinct', value: chosenInstinct || '—', inline: true },
			)
			.addFields(
				{ name: 'Moves', value: moveList.slice(0, 1024), inline: false },
			);
		break;
	}
	case 'background': {
		const text = chosenBackground && pb.backgrounds?.[chosenBackground]
			? `**${chosenBackground}**\n\n${pb.backgrounds[chosenBackground].text || ''}`
			: '`(not recorded for this character)`';
		embed = new EmbedBuilder()
			.setTitle(`${sectionTitle} — ${record.name}`)
			.setDescription(text.slice(0, 4096));
		break;
	}
	case 'instinct': {
		const text = chosenInstinct && pb.instincts?.[chosenInstinct]
			? `**${chosenInstinct}**\n\n_${pb.instincts[chosenInstinct]}_`
			: '`(not recorded for this character)`';
		embed = new EmbedBuilder()
			.setTitle(`${sectionTitle} — ${record.name}`)
			.setDescription(text.slice(0, 4096));
		break;
	}
	case 'moves': {
		let moveList = '';
		if (chosenMoves.length) {
			chosenMoves.forEach(m => {
				const md = pb.allMoves?.[m];
				const text = md && md.text ? md.text.split('\n---')[0].substring(0, 1000) : '';
				moveList += `**${m}**\n${text || '—'}\n\n`;
			});
		}
		else {
			moveList = '—';
		}
		embed = new EmbedBuilder()
			.setTitle(`${sectionTitle} — ${record.name}`)
			.setDescription(moveList.slice(0, 4096));
		break;
	}
	default:
		return null;
	}

	embed.setFooter({ text: `${pb.name} — ${sectionTitle}` });
	embed.setTimestamp(new Date());
	return embed;
}

/**
 * Build section-navigation components for the playbook view.
 * @returns {{ selectRow: ActionRowBuilder, total: number, sections: string[] }}
 */
function buildPlaybookNav(record) {
	const sections = ['overview', 'background', 'instinct', 'moves'];

	const select = new StringSelectMenuBuilder()
		.setCustomId(`rhune:playbook:section:${record.id}`)
		.setPlaceholder('Jump to playbook section…')
		.setMinValues(1)
		.setMaxValues(1);

	sections.forEach(s => {
		const labels = { overview: '📋 Overview', background: '📜 Background', instinct: '💭 Instinct', moves: '⚔️ Moves' };
		select.addOptions(
			new StringSelectMenuOptionBuilder()
				.setLabel(labels[s] || s)
				.setValue(s),
		);
	});

	return new ActionRowBuilder().addComponents(select);
}

function getAllMoves(playbookKey) {
	const pb = lookupPlaybook(playbookKey);
	if (!pb) return {};
	return pb.allMoves || {};
}

module.exports = { lookupPlaybook, renderPlaybookEmbed, buildPlaybookNav, getAllMoves, parseChoices, getCharacterMoveList };


const Blessed = {
	name: 'The Blessed',
	tagline: 'Danu, the Great Mother, provides. We need only learn her secrets: the names by which the trees call each other; the mark made with redberry juice to ward off impure spirits; the language of the wolves. A thousand such secrets Danu keeps, to share with only her true children. Her Blessed.',
	backgrounds: {
		'Initiate': { text: `Stonetop has long been home to a sacred order, keepers of the old ways and speakers for Danu. You are one such initiate, the most gifted in generations. You gain the **Rites of the Land** move.
There are other initiates in Stonetop, serving the goddess and the village. They aid you as followers — see the *Initiates of Danu* insert. Who are they? **Choose 2 or 3:**
- Enfys, your acolyte, beloved by birds
- Afon, strange and Fae-touched
- Gwendyl, your mentor, a talented healer
- Olwin, your anointed lover, seer of fates
- Seren the Eldest, wise and hard as winter`, grants: ['Rites of the Land'] },
		'Raised by Wolves': { text: `Maybe not by wolves, but you grew up in the wild. Beasts of land and air were your siblings. The sighing wind taught you language. The trees and rocks were your home. Were you one of the Forest Folk? Abandoned or orphaned? Lured into the Wood?
Regardless, you get the **Trackless Step** move (mark it now). Also, when you **Forage**, you have advantage.
For some reason, you've made yourself known to Stonetop and perhaps you even call it home. But the ways of humans are still strange to you. Once per session, when your wild ways offend or alienate you from someone, mark XP.`, grants: ['Trackless Step'] },
		'Vessel': { text: `A seed of Danu's power has taken root in your soul. Perhaps it has always been there and only recently sprouted. Or maybe it was planted in you during some portentous event.
Regardless, your dreams have been haunted by strange markings and symbols. You feel the mystic power in plants, stones, and soil. And you've felt the growing wrath of the Earth Mother as foul things begin to move about. Take the **Danu's Grasp** move (mark it now).
Danu's power flows through you, but at great cost. When you would spend 1 Stock from your sacred pouch, you may choose to lose 2d4 HP instead.
---`, grants: ['Danu\'s Grasp'] },
	},
	instincts: {
		'Delight': 'To find beauty, in even the most ugly thing.',
		'Detachment': 'To remain unmoved, to be cold as winter.',
		'Nurture': 'To help others grow, learn, or improve.',
		'Preservation': 'To protect the natural world.',
		'Reverence': 'To demand sacrifice to the spirits and Danu.',
	},
	startingMoves: {
		'Spirit Tongue': `You can speak with beasts and spirits. You can always ask the GM, *"What spirits are active here?"* and get an honest answer.
---`,
		'Call the Spirits': `*(Requires Spirit Tongue)*
When you spend 1 Stock and perform a short rite, the spirit(s) of a place or object manifest and hear you out. What they do next is up to them.
---`,
	},
	allMoves: {
		'Spirit Tongue': { text: `You can speak with beasts and spirits. You can always ask the GM, *"What spirits are active here?"* and get an honest answer.
---`, starred: true },
		'Call the Spirits': { text: `*(Requires Spirit Tongue)*
When you spend 1 Stock and perform a short rite, the spirit(s) of a place or object manifest and hear you out. What they do next is up to them.
---`, starred: true },
		'Amulets & Talismans': { text: `When you craft a protective charm for someone, spend 1 Stock and name a source of harm (fire, stabbing, etc.). When they would suffer such harm while bearing your charm, roll +INT:
- **10+:** They ignore the harm entirely.
- **7–9:** They suffer only half the damage or effect.
- **6−:** They suffer the harm normally.
One can benefit from only 1 charm at a time, and it loses its potency after 1 use.
---`, starred: false },
		'Barkskin': { text: `When you are touching the earth, you have 2 armor. When you mark another with 1 Stock, they gain this benefit so long as the mark remains.
---`, starred: false },
		'Big Magic': { text: `Each time you take this move, choose an additional remarkable trait for your sacred pouch and increase your max Stock by 2.
---`, starred: false },
		'Borrow Power': { text: `*(Requires Spirit Tongue)*
When a spirit or beast loans you power, ask the GM for one of its tags or moves. Store it in your pouch in place of 1 Stock. When you use the borrowed tag or move, roll +WIS:
- **10+:** You do it and can use the power again.
- **7–9:** You do it, but lose the power.
---`, starred: false },
		'Danu\'s Grasp': { text: `When you call on the world itself to bind a spirit or a perversion of nature, spend 1 Stock and roll +WIS:
- **7–9:** Roots, vines, and earth pull at them, and they pick 1.
- **10+:** As 7–9, but both apply.
  - They're restrained, unable to act freely until your focus slips or they tear their way free.
  - They take 2d4 damage (ignores armor).
If this brings them to 0 HP, they are pulled into the earth and bound in rune-etched stone.
---`, starred: false },
		'Healer\'s Arts': { text: `When someone **Recovers** under your care, they recover (extra) HP equal to your WIS. If you also spend 1 Stock, they heal an extra 5 HP and their wounds/injuries are stabilized.
---`, starred: false },
		'Heed My Words': { text: `When you **Persuade** by talking sense or warning against foolishness, you have advantage.
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'Into the Lion\'s Den': { text: `When you approach a beast calmly and show no fear, it will not harm you (though it may threaten you and test your nerve). When you lay your hand gently upon a beast, it calms to your touch.
---`, starred: false },
		'Lightning Rod': { text: `When you **Defend** while touching the earth, you can spend 1 Readiness to intercept a nearby magical attack and redirect it harmlessly into the ground.
---`, starred: false },
		'Rites of the Land': { text: `Once per season, when you oversee the sacred rites, hold 1 Favor. If you also sacrifice 1 Surplus, hold 4 Favor instead. Spend Favor in lieu of Stock, 1-for-1.
When you publicly sacrifice something or someone much-loved, either clear a steading debility or gain advantage when the steading next rolls +Fortunes.
---`, starred: false },
		'Trackless Step': { text: `When you move through nature with care and patience, you make no sound, leave no trace, and can ignore any hindering or treacherous terrain (briars, mire, scree, etc.). When you spend 1 Stock and mark others, they each gain this benefit so long as the mark remains. 1 Stock can mark a number of individuals up to your level+INT.
---`, starred: false },
		'Veil': { text: `When you wrap yourself or another in a subtle veil, spend 1 Stock and choose 1:
- A type of being you name (including "people") will tend to ignore your presence.
- People will perceive you as someone else, though you must wear something of an individual's in order to impersonate them.
When your deception comes under scrutiny, roll +INT:
- **10+:** The veil holds, and no one is the wiser.
- **7–9:** The veil holds, but there is further scrutiny or a complication (GM's choice).
---`, starred: false },
		'Wards & Bindings': { text: `When you mark a boundary with sacred signs, spend 1 Stock and describe who or what they affect (using no more words than your level). Also, choose whether the affected beings are repelled or trapped by the signs.
When your wards or bindings are first tested, roll +INT:
- **10+:** They will hold as long as the signs remain unmarred (and the affected creature can do nothing to affect them directly).
- **7–9:** They hold for now but may be overcome through might or will.
---`, starred: false },
		'Wild Soul': { text: `*(Requires level 2+ and the Blessed)*
Each time you take this move, gain a Ranger move of your choice for which you qualify. You can't pick Improved Stat or Superior Stat.
---`, starred: false },
		'Nature\'s Wrath': { text: `*(Requires level 6+ and Danu's Grasp)*
**Danu's Grasp** gains the *area* tag and can affect any creature. A mortal reduced to 0 HP is subdued or killed (your choice) rather than bound in stone.
---`, starred: false },
		'Potent Workings': { text: `*(Requires level 6+ and Amulets & Talismans)*
When you craft a protective charm, you may spend 1 additional Stock to choose 1:
- Name an additional type of harm.
- On a 10+, the charm retains its potency.
---`, starred: false },
		'Shared Souls': { text: `*(Requires level 6+ and Into the Lion's Den)*
When you mark a beast with 1 Stock, you can direct its actions and perceive through its senses no matter the distance between you. Treat it as a follower with 3 Loyalty; when you spend its last Loyalty, the effect ends.
---`, starred: false },
		'Suck the Poison Out': { text: `*(Requires level 6+ and Healer's Arts)*
When you draw a malady from a patient's body, mind, or soul, spend 1 Stock and roll +WIS:
- **10+:** You remove the malady and can safely discard it or store it in your sacred pouch (taking the space of 1 Stock) to study or inflict on another.
- **7–9:** You remove it, but choose 1:
  - Your patient suffers lingering harm or trauma.
  - You suffer some of the malady's effects.
  - It will be harmful and dangerous to discard.
---`, starred: false },
		'Superior Stat': { text: `*(Requires level 6+)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
		'Voice of the Earth Mother': { text: `*(Requires level 6+ and Spirit Tongue)*
When you speak on behalf of Danu, natural beasts and spirits of the wild respect your authority. All but the most headstrong will do as you command, even against their instincts.
---`, starred: false },
	},
	creationRules: { intro: '*You start with **Spirit Tongue**, **Call the Spirits**, 1 from your Background, and 1 of your choice.*', die: 'd6', maxHP: 18, startingPickCount: 1,
		possessions: {
			pickCount: 2,
			always: ['Sacred pouch'],
			options: [
				{ name: 'Sacred pouch (magical)', desc: 'Holds up to 3 Stock of sacred materials.' },
				{ name: 'Apiary', desc: 'Beeswax, candles, honey, bee smokers, hats & veils.' },
				{ name: 'Collected offerings', desc: 'Produce something valuable to a spirit of the wild. Restore 1 use each season.' },
				{ name: 'Goat herd', desc: 'Milk, cheese, pelts, meat, blood, horn, wool. Each season 1-in-4 chance of bezoar.' },
				{ name: 'Herb garden', desc: 'Shears, mortars, herbs, seeds, remedies, mild poisons. Each spring d4 uses of bendis root.' },
				{ name: 'Mastiffs (2-3 followers)', desc: 'Alert, keen-nosed, fierce; HP 6; Damage d6 (hand, grabby).' },
			],
		},
	},
};
playbooks.Blessed = Blessed;

const Fox = {
	name: 'The Fox',
	tagline: 'The elders tell a story about Fox, who knows lots of tricks, and Hedgehog, who knows one: how to curl up into a ball when there\'s danger. Fox can\'t eat Hedgehog when he\'s all curled up, so in the story Fox goes hungry. But you\'re not that Fox, and this is no story. You want that Hedgehog? Go get a knife.',
	backgrounds: {
		'The Natural': { text: `You grew up around here, and always picked things up quickly. Reading and numbers, sure, but more. Hide and seek. Throwing stones. Climbing. Fighting. Whatever you tried, you were good at it. As good as anyone else, if not better.
Sure, you've got a reputation for bending the rules. Playing dirty. But why play if you don't play to win, right? And who do they come to when there's a problem needs solving? You, that's who.
When you **Seek Insight**, you may roll +INT instead of +WIS and add *"What opportunity does no one else see?"* to the list of possible questions.
---`, grants: [] },
		'A Life of Crime': { text: `You're new to Stonetop, having left behind a...colorful past. How did you get into that life? Why and how did you get out? Who and what did you leave behind?
Regardless, these people have taken you in. Time to lead an honest life, right?
You start with either **Burgle** or **Light Fingers** (your choice) as an extra move, and either *burglar tools* or a *hidden stash* (your choice) as an additional special possession. Mark them now.
---`, grants: [] },
		'The Prodigal Returned': { text: `You left long ago, travelling far and living by your wits. Why did you leave? What deeds do you boast of, and which do you regret?
You always longed to return to Stonetop, and return you have. You're a bit of a celebrity now, and you've got friends (or close enough) strewn about the known world.
When you declare that you know someone outside of Stonetop — someone who can help — name them and roll +CHA:
- **10+:** Yeah, they can help (tell us why they're willing).
- **7–9:** They can help, but pick 1:
  - They still hold a grudge.
  - They're going to need something from you first.
  - They swore off this sort of thing long ago.
  - You can't exactly, y'know, trust them.
- **6−:** The GM chooses 1, and then some.
---`, grants: [] },
	},
	instincts: {
		'Conscience': 'To feel guilty, to try to do right.',
		'Freedom': 'To chafe against rules, expectations, obligations.',
		'Comfort': 'To enjoy yourself and avoid hardship.',
		'Prestige': 'To impress others, to build a name for yourself.',
		'Trickery': 'To deceive, misdirect, outthink.',
	},
	startingMoves: {
	},
	allMoves: {
		'All in the Wrist': { text: `Any knife or dagger gets the *thrown* tag in your hands. Also, you keep a few iron throwing blades (near) on you; they don't take up space in your inventory. Reset your ammo whenever you **Outfit**.
---`, starred: false },
		'Ambush': { text: `When you get the drop on a nearby foe, you can deal your damage OR roll +DEX:
- **10+:** Deal your damage and pick 2.
- **7–9:** Deal damage and pick 1.
  - Deal +1d4 damage.
  - Stop them from making noise/raising an alarm.
  - Slip away before they can react.
  - Create an opportunity; you or an ally gains advantage on the next move to act on it.
---`, starred: false },
		'Burgle': { text: `When you sneak off on your own into a dangerous place, roll +INT:
- **7+:** You make it back, and the GM says where you got to and what you learned. Then:
  - **10+:** Also pick 2.
  - **7–9:** Also pick 1.
  - You got away clean, rousing no suspicion.
  - You swiped something valuable (GM's choice).
  - You set something up to exploit on your return.
  - Ask a Seek Insight question about what you saw.
- **6−:** You either make it back but with trouble in tow, or you're missing in action (your call).
---`, starred: false },
		'Catlike': { text: `When you carry a light load and act with care, you move silently. When you hide in shadows or darkness, you remain unseen until you draw attention to yourself, move positions, or attack.
---`, starred: false },
		'Dabbler': { text: `*(Requires level 2+ and the Fox)*
Each time you take this move, choose a move from the Heavy, Marshal, Ranger, or Seeker playbooks for which you otherwise qualify. (You can't take Improved Stat or Superior Stat.)
---`, starred: false },
		'Danger Sense': { text: `You can always ask the GM, *"Is there an ambush or trap here?"* If they say "yes," roll +INT:
- **10+:** Ask the GM both questions below.
- **7–9:** Ask 1.
- Either way, gain advantage on your next roll to act on the answer(s).
  - What will trigger the ambush or trap?
  - What will happen once it's triggered?
- **6−:** Don't mark XP; you know there's a trap or ambush, but nothing bad happens just yet.
---`, starred: false },
		'Free Running': { text: `When you carry a light load and move with speed and grace, gain advantage on any move to surmount or bypass a physical obstacle.
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'Irresistible': { text: `When you interact with someone, you can ask their player if they find you attractive and get an honest answer (usually "yes").
When you **Persuade** by using your considerable charms as leverage, you have advantage.
---`, starred: false },
		'Laugh at Danger': { text: `When you are about to roll +CON and you make a joke about the adversity you face, you can roll +CHA instead.
---`, starred: false },
		'Light Fingers': { text: `When you perform sleight of hand on an unwary mark, you succeed and no one's the wiser. If you're being watched, roll +DEX:
- **10+:** You succeed and no one's the wiser.
- **7–9:** You succeed OR no one's the wiser (your choice).
---`, starred: false },
		'Perceptive': { text: `When you **Seek Insight**, you may ask 1 additional question. Even on a 6−, you can ask 1 question (though you might not like how you learn the answer).
---`, starred: false },
		'Rapier Wit': { text: `When you pierce an NPC's pride with a well-placed quip, they must do 1 (their choice):
- Attack, dealing +1d4 damage if they hit — but giving you advantage on your next roll against them.
- Stoop to your level and respond in kind.
- Spend a few moments fuming, sputtering, or controlling their temper.
---`, starred: false },
		'Skill at Arms': { text: `When you wield a weapon with speed and grace, roll +DEX to **Clash** (instead of +STR).
---`, starred: false },
		'Parry & Riposte': { text: `*(Requires Skill at Arms)*
When you **Defend** with a weapon that you can wield quickly, you can spend 1 Readiness to both halve an attack's effects/damage AND strike back at the attacker (deal your damage with disadvantage), instead of spending 1 Readiness for each.
---`, starred: false },
		'Silver Tongued': { text: `When you use words to avoid suspicion or trouble, roll +CHA:
- **10+:** Hold 3 Nerve.
- **7–9:** Hold 1 Nerve.
Spend Nerve 1-for-1 to:
- Move about or maneuver unchallenged.
- Withstand direct scrutiny or questioning.
- Direct suspicion or attention elsewhere.
---`, starred: false },
		'Under Your Skin': { text: `When you engage an NPC in conversation, you can ask the GM 1 of these and get an honest answer:
- What are they expecting me to do?
- What, in general, are they trying to hide?
- What do they want to happen?
---`, starred: false },
		'Battle Dancer': { text: `*(Requires level 6+ and Skill at Arms)*
When you roll +DEX to **Clash**, on a 12+ you deal your damage, avoid your enemy's attack, and impress/embarrass/overawe your foes.
---`, starred: false },
		'Cheap Shot': { text: `*(Requires level 6+ and Ambush)*
When you **Ambush** with a hand weapon, you have advantage on your damage roll.
---`, starred: false },
		'Eye on the Door': { text: `*(Requires level 6+)*
When you and your allies need to get out of here, name your escape route and roll +INT:
- **10+:** You're gone.
- **7–9:** You can stay or go, but if you go, it costs you — the GM will tell you what (or who) you leave behind or take with you.
---`, starred: false },
		'Pants on Fire': { text: `*(Requires level 6+)*
When you **Defy Danger**, **Persuade**, or **Interfere** by being deceitful, you have advantage.
When another move (like Seek Insight) allows a player to ask you a question, you can opt not to answer.
---`, starred: false },
		'Second Intent': { text: `*(Requires level 6+, Parry & Riposte, and Ambush)*
When you **Defend** and spend 1 Readiness to Parry & Riposte, also pick 1 option from the Ambush list.
---`, starred: false },
		'Slippery': { text: `*(Requires level 6+)*
When you roll to escape being caught or controlled, treat a 6− as a 7–9. On a 12+, say how you turn the tables or use the circumstances to your advantage.
---`, starred: false },
		'Superior Stat': { text: `*(Requires level 6+)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
	},
	creationRules: { intro: '*You start with either **Weapon Training** (Ambush + Skill at Arms) or **Natural Instincts** (Danger Sense + Perceptive), plus 1 of your choice.*', die: 'd6', maxHP: 16, orGroups: [{ label: 'Choose your specialty', options: [{ name: 'Weapon Training', grants: ['Ambush', 'Skill at Arms'], desc: 'Ambush + Skill at Arms' }, { name: 'Natural Instincts', grants: ['Danger Sense', 'Perceptive'], desc: 'Danger Sense + Perceptive' }] }], startingPickCount: 1,
		possessions: {
			pickCount: 2,
			options: [
				{ name: 'Burglar\'s kit', desc: 'Picks, files, snippers, wire, prybars, hacksaws, lantern, grappling hook.' },
				{ name: 'Carpenter\'s tools', desc: 'Chisels, files, nails, pitch, prybars, saws, firkins, barrels.' },
				{ name: 'Distillery', desc: 'Fine whisky (uses grant advantage to Persuade), copper tubes, malt, firkins, stills, barrels.' },
				{ name: 'Hidden stash', desc: 'Each use produces valuables worth a purse of silvers (Value 2).' },
				{ name: 'Mummer\'s kit', desc: 'Juggling balls, whirlybird seeds, motley, ribbons, bells, puppets, a fiddle.' },
				{ name: 'Scribe\'s tools', desc: 'Parchment, ink, pigments, vials, quills, a notebook.' },
				{ name: 'Tannery (or access to it)', desc: 'Lime, acid, salts, thick gloves, a boiled leather cuirass (1 armor).' },
				{ name: 'Trade contacts', desc: 'Small amounts of salt, glass, silk, spice, medicinal herbs, pigments, ivory.' },
			],
		},
	},
};
playbooks.Fox = Fox;

const Heavy = {
	name: 'The Heavy',
	tagline: 'These are good people. Hard-working, honest. They look out for each other. But sometimes, looking out for each other ain\'t enough. Sometimes, good people need someone to stick up for them. Someone who\'s not afraid to get a little bloody. To get heavy. Yeah, someone like you.',
	backgrounds: {
		'Sheriff': { text: `You keep order in Stonetop and protect it from outside threats. It might not be anything official, but everyone knows you've got a cool head and the weight to back up your words.
When you bark an order or warning, roll +CHA:
- **7+:** They must choose 1:
  - Do what you say.
  - Dig in / take cover / flee.
  - Attack you.
- **10+:** You can sense which one they're about to do and act first if you like; gain advantage if you do.
---`, grants: [] },
		'Blood-Soaked Past': { text: `You left behind a life of violence and a name mothers used to scare their children. For whatever reason, the people of Stonetop took you (back?) in and treat you like one of their own.
When you **Persuade** using violence or threats against someone who knows your black reputation, you can roll +STR instead of +CHA. Also, if you take the **Formidable** move, you can choose to roll +CON instead of +CHA.
When you fight to kill without mercy or hesitation, you deal +1d4 damage.
---`, grants: [] },
		'Storm-Marked': { text: `You've been touched by Tor (Rain-maker, Thunderhead, Slayer-of-Beasts!) and bear runic markings similar to those etched into the Stone. When did the marks manifest? Are they a symbol of your strength, speed, and courage? Or their source?
You start with the **Storm Markings** major arcanum. Mark one of the boxes on the Storm Markings sheet, and describe the time you were struck by lightning and walked away unharmed.
---`, grants: ['Storm Markings'] },
	},
	instincts: {
		'Peace': 'To avoid (further) bloodshed or violence.',
		'Pride': 'To maintain your dignity, to demand respect.',
		'Recklessness': 'To act without thought to the consequences.',
		'Trouble': 'To stick your nose in where it\'s unwelcome.',
		'Violence': 'To solve problems by force.',
	},
	startingMoves: {
		'Dangerous': `*(Requires the Heavy)*
When you deal your damage, you have advantage.
---`,
		'Hard to Kill': `When you are at Death's Door, you can roll +CON or +nothing (your choice). On a 7–9, you can mark a debility of your choice to regain 1 HP.
---`,
	},
	allMoves: {
		'Dangerous': { text: `*(Requires the Heavy)*
When you deal your damage, you have advantage.
---`, starred: true },
		'Hard to Kill': { text: `When you are at Death's Door, you can roll +CON or +nothing (your choice). On a 7–9, you can mark a debility of your choice to regain 1 HP.
---`, starred: true },
		'Armored': { text: `When you carry a shield, mark only ☐ (instead of ☐☐). Also, you can ignore the *cumbersome* tag on any armor you wear.
If you take this move at the start of play, add an **iron hauberk**, **bronze cuirass**, or **scale coat** to your inventory (all are 2 armor, warm, cumbersome).
---`, starred: false },
		'Battle Joy': { text: `When you spill blood — yours or another's — and lose yourself in battle, you ignore fear, pain, mind-control, and the effects of debilities as long as you keep fighting.
When the action stops, roll +CON:
- **10+:** That was a rush; regain 1d4 HP.
- **7–9:** You're winded and out of it, but fine with a few minutes' rest.
- **6−:** Mark a debility, but don't mark XP.
---`, starred: false },
		'Berserker': { text: `*(Requires Battle Joy)*
While in your Battle Joy, add the *area* tag to your melee attacks, lashing out at anyone nearby (friend and foe alike). Roll damage separately for each target.
---`, starred: false },
		'Carved Out of Wood': { text: `Increase your max HP by 4.
---`, starred: false },
		'Formidable': { text: `When you wade into battle, you can choose to roll +CHA:
- **10+:** Both.
- **7–9:** Pick 1.
  - Lesser foes will quail, hesitate, or flee before you.
  - Doughty foes will focus on you, seeing you as the greatest threat.
- **6−:** Pick 1, but ask the GM what you've missed.
---`, starred: false },
		'Frosty': { text: `When you **Defy Danger** by keeping calm and carrying on, on a 10+ you can also ask the GM a question that you could ask when **Seeking Insight**. You have advantage on your next move to act on the answer.
---`, starred: false },
		'Guardian': { text: `When you **Defend**, hold 1 extra Readiness. Even on a 6−, hold 1 Readiness (plus whatever the GM says).
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'Intimidating': { text: `When you **Persuade** using violence or threats, you have advantage.
---`, starred: false },
		'Musclebound': { text: `*(Requires Strength +2 or higher)*
When you make a hand-to-hand or thrown attack, it's *forceful* and *messy*. If it would already be forceful and/or messy, it's even more so.
---`, starred: false },
		'Payback': { text: `When you deal damage to a foe that has harmed you or one of your allies, deal +1d4 damage.
---`, starred: false },
		'Relentless': { text: `When you **Clash** and your foe survives, you gain advantage the next time you Clash with them.
---`, starred: false },
		'Seasoned Warrior': { text: `*(Requires level 2+ and the Heavy)*
Take a move from the Fox, Marshal, Ranger, or Seeker playbooks, for which you otherwise qualify. You can pick from a different playbook each time. (You can't pick Improved Stat or Superior Stat.)
---`, starred: false },
		'Situational Awareness': { text: `When you **Seek Insight**, add the following to the list of questions you can ask:
- Who or what here is the biggest threat?
- What is my enemy's true position?
- What here can I use as a weapon?
When a fight breaks out, ask the GM 1 question that you could ask when Seeking Insight.
---`, starred: false },
		'Uncanny Reflexes': { text: `When you are unarmored and carrying a normal or light load, you impose disadvantage on any damage you take that you could dodge or roll with.
---`, starred: false },
		'Unfettered': { text: `When you are subject to physical or mental restraint, you may mark a debility to immediately break free of that restraint.
---`, starred: false },
		'Unstoppable': { text: `*(Requires Hard to Kill)*
When you are reduced to 0 HP in battle, you can keep fighting. Each time you take damage while at 0 HP, mark 1. If you would regain HP while fighting, clear one mark instead.
When you stop fighting, roll for Death's Door with a −1 penalty for each circle marked. If you survive, clear all your circles.
---`, starred: false },
		'Terror on the Field': { text: `When you reduce a foe to 0 HP, describe how you take them out. If you fell them in a particularly brutal or impressive manner, their allies are impressed, dismayed, or frightened and respond accordingly.
---`, starred: false },
		'Bringer of Ruin': { text: `*(Requires level 6+)*
When you roll a 12+ to **Clash** and your foe survives, name something they possess (their sword, their position, a limb, their dignity, etc.) — nothing that would kill them outright. Whatever you name, it is broken, shattered, lost. Tell us how.
---`, starred: false },
		'Cut from Granite': { text: `*(Requires level 6+ and Carved Out of Wood)*
Gain +1 armor (stacks with other sources) and increase your max HP by another 2 (+6 HP total from both moves).
---`, starred: false },
		'Mighty Thews': { text: `*(Requires level 6+ and Musclebound)*
When you perform a feat of extraordinary strength (bursting chains, smashing through a wall, heaving a boulder, etc.), you do it — but pick 1:
- It takes a while.
- You cause unwanted damage or harm.
- It takes a toll (mark a debility).
---`, starred: false },
		'Nemesis': { text: `*(Requires level 6+ and Relentless)*
When you **Clash** and your foe survives, all of your future attacks against them do +1d6 damage.
---`, starred: false },
		'Steadfast Guardian': { text: `*(Requires level 6+ and Guardian)*
While you hold Readiness (from **Defend**), you can always suffer the damage/effects of an attack instead of your ward — no need to spend Readiness, you can just do it.
---`, starred: false },
		'Stone Cold': { text: `*(Requires level 6+ and Frosty)*
When you **Defy Danger** (or **Struggle as One**) by keeping calm and carrying on, treat a 6− as a 7–9.
---`, starred: false },
		'Superior Stat': { text: `*(Requires level 6+)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
	},
	creationRules: { intro: '*You start with **Dangerous**, **Hard to Kill**, and either **Armored** OR **Uncanny Reflexes**.*', die: 'd6', maxHP: 20, orGroups: [{ label: 'Defensive Style', options: [{ name: 'Armored', grants: ['Armored'], desc: 'Uncanny reflexes, thick hide, or masterwork plate' }, { name: 'Uncanny Reflexes', grants: ['Uncanny Reflexes'], desc: 'Light-footed and impossible to pin down' }] }], startingPickCount: 0,
		possessions: {
			pickCount: 2,
			options: [
				{ name: 'Distillery', desc: 'Fine whisky (uses grant advantage to Persuade), copper tubes, malt, firkins, stills, barrels.' },
				{ name: 'Chirurgeon\'s tools', desc: 'Catgut, straps, bandages, tubes, poultices, willow bark, bonesaws.' },
				{ name: 'Husbandry tools', desc: 'Brushes, muzzles, collars, feed, whips, bridles. Advantage to Persuade domestic beasts.' },
				{ name: 'Smithy (or access to it)', desc: 'Iron goods, ingots, thick gloves, tongs, bellows, an anvil.' },
				{ name: 'Stoneworker\'s tools', desc: 'Chisels, drills, prybars, spikes, block & tackles, wheelbarrow.' },
				{ name: 'Weapons of war (choose up to 3)', desc: 'Sword (+1 dmg), Battleaxe (messy), Warhammer (2 piercing), Mace (forceful), or Crossbow (far, +1 dmg).' },
			],
		},
	},
};
playbooks.Heavy = Heavy;

const Judge = {
	name: 'The Judge',
	tagline: 'Look here at this little town, this candleflame in the darkness. Its very existence is an act of courage and faith. And Aratis has charged you to keep it: to settle its disputes; to chronicle its tales; to defend it from darkness and ruin. Take up your hammer, Judge. Your town needs you.',
	backgrounds: {
		'Legacy': { text: `You are the latest in a long line of Judges — born here, apprenticed to the prior Judge, and charged with the passing of the mantle. The Chronicle is a rich repository of lore, but there's no index, so good luck finding anything.
When you **Know Things** about the people or history of Stonetop, you have advantage.
When you spend days, weeks, or months poring over the Chronicle, ask the GM a question, and the GM will tell you what you learn in that time.
---`, grants: [] },
		'Missionary': { text: `You are part of a larger order of Judges, sent here to protect the flickering flame of civilization. The Chronicle is relatively new; your position in town is far from certain.
Add these Judges to the Neighbors section of the steading playbook *(pick 2 more)*:
- ☐ Devin (from Marshedge)
- ☐ Haeris (from Gordin's Delve)
- ☐ Isalde (from the Manmarch)
- ☐ Rahat (from Lygos)
- ☐ Tejisha (from Barrier Pass)
- ☐ Unz (from the Hillfolk)
When you call upon the Judge of another steading for aid or information, they are oathbound to give it. You are likewise oathbound to support them.
You have an **aviary** in addition to your usual choice of special possessions (mark it now). When you send a message via trained bird, as is the way of the Judges of your order, the GM will tell you if and when you receive a response, and what it says.
---`, grants: [] },
		'Prophet': { text: `The line of Judges was broken long ago, the Chronicle lost or fallen into ruin. Aratis has called you personally to her service through dreams, omens, and visions. Some in town resent the authority you've assumed.
When you spend a few days communing with Aratis about a threat facing Stonetop or civilization as a whole, roll +WIS:
- **7+:** Aratis reveals the course of action she would have you take.
- **10+:** As above, and you also hold 2 Sanction. While acting on her orders, spend 1 Sanction to add +1 to a roll you just made.
---`, grants: [] },
	},
	instincts: {
		'Ambition': 'To increase your status or influence.',
		'Dispassion': 'To disregard emotion or sentiment.',
		'Harmony': 'To seek a path that makes everyone happy.',
		'Orthodoxy': 'To strictly adhere to rules and traditions.',
		'Zeal': 'To judge quickly and without doubt.',
	},
	startingMoves: {
		'Censure': `When you first denounce an individual in your presence as an agent of chaos or anathema to civilization, they pick 1:
- They are ashamed, and act accordingly.
- They are doubtful, and hesitate, pause.
- They are afraid, and seek to escape.
- They are enraged, and lash out predictably (the next roll against them has advantage).
---`,
		'Chronicler of Stonetop': `When you write up detailed session notes and share them with the other players, hold +1 Diligence.
You can spend 1 Diligence at any time to add +1 to a roll that you or a fellow player just made.
---`,
	},
	allMoves: {
		'Censure': { text: `When you first denounce an individual in your presence as an agent of chaos or anathema to civilization, they pick 1:
- They are ashamed, and act accordingly.
- They are doubtful, and hesitate, pause.
- They are afraid, and seek to escape.
- They are enraged, and lash out predictably (the next roll against them has advantage).
---`, starred: true },
		'Chronicler of Stonetop': { text: `When you write up detailed session notes and share them with the other players, hold +1 Diligence.
You can spend 1 Diligence at any time to add +1 to a roll that you or a fellow player just made.
---`, starred: true },
		'Aegis of Faith': { text: `When you wield a shield, it can turn away spells, magical effects, and insubstantial attacks as if they were physical blows.
---`, starred: false },
		'Armored': { text: `When you carry a shield, mark only ☐ (instead of ☐☐). Also, you can ignore the *cumbersome* tag on any armor you wear.
If you take this move at the start of play, add an **iron hauberk**, **bronze cuirass**, or **scale coat** to your inventory (all are 2 armor, warm, cumbersome).
---`, starred: false },
		'Bear Witness': { text: `When you speak the truth with conviction and candor, none can doubt you. They might deny what you say, but in their hearts they recognize the truth.
---`, starred: false },
		'Break Bread': { text: `When you share a proper meal with someone and each of you eats their fill, each of you recovers 1d8 (extra) HP.
---`, starred: false },
		'Bulwark': { text: `When you **Defend**, you can spend 1 Readiness to stand fast, holding your position despite what befalls you.
---`, starred: false },
		'Castigate': { text: `*(Requires level 2+ and Censure)*
When you **Censure** someone, your voice deals 1d4 damage to them (near, loud, ignores armor).
---`, starred: false },
		'For the Greater Good': { text: `When you **Persuade** someone to act in defense of their community or civilization at large, you have advantage.
---`, starred: false },
		'Hound of Aratis': { text: `When you **Seek Insight**, you can always ask *"What here is tainted by chaos?"* for free, even on a 6−.
---`, starred: false },
		'Like a Dog with a Bone': { text: `*(Requires Hound of Aratis)*
When you attack something you know to be tainted by chaos, deal +1d6 damage.
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'Knowledge Is Power': { text: `When you roll 10+ to **Know Things**, you or an ally gain advantage on the next roll to act on what you learn.
---`, starred: false },
		'Many Hands Make Light Work': { text: `When you jump in to help another character who just rolled, tell us how and ask the GM what else is required or what the consequences will be. If you accept, increase your ally's roll by +1.
---`, starred: false },
		'A Bundle of Sticks Unbroken': { text: `*(Requires Many Hands Make Light Work)*
When you **Struggle as One**, you and one ally of your choice have advantage.
---`, starred: false },
		'The Hammer and the Book': { text: `When you strike a thing of supernatural chaos, roll +WIS:
- **10+:** Deal your damage and choose 1.
- **7–9:** Deal damage and choose 1, but you also expose yourself to harm or unwanted attention.
  - Deal +1d6 damage.
  - Ignore the thing's armor or other defenses.
  - Suppress one of its unnatural powers.
  - Force it from its host.
---`, starred: false },
		'Truth or Consequences': { text: `When you look into someone's eyes and gaze upon their soul, you can ask their player, *"Are you lying or hiding something from me?"* and get an honest answer. If the answer is "Yes," you have advantage on your next roll against them.
When you lie or otherwise deceive someone through words, you have disadvantage on your next roll against them.
---`, starred: false },
		'Binding Arbitration': { text: `*(Requires Truth or Consequences)*
When you bear witness to someone's promise or oath, henceforth you may ask their player if they have kept their word. They must answer honestly. The character need not be present. If they have broken their word, you gain advantage on all rolls against them until they admit their wrong and suffer an appropriate consequence (your call).
---`, starred: false },
		'Vision Unclouded': { text: `When you **Seek Insight**, you can always ask *"What here is hidden by illusion or magic?"* for free, even on a 6−.
---`, starred: false },
		'Well-Read': { text: `When you name the source in which you read about the matter at hand, roll +WIS to **Know Things** instead of +INT.
---`, starred: false },
		'A Mighty Rampart': { text: `*(Requires level 6+; replaces Bulwark)*
When you hold Readiness (from **Defend**), you cannot be forced from your position. Also, you can spend 1 Readiness to completely ignore the effects/damage of an attack that you suffer.
---`, starred: false },
		'Armistice': { text: `*(Requires level 6+ and Bear Witness)*
When you approach an enemy to negotiate in good faith, they will at least hear you out. Even the most debased and savage foe will delay violence until you've had your say.
---`, starred: false },
		'Condemn': { text: `*(Requires level 6+ and Censure)*
When you **Censure** someone, they are marked with a mystical brand that cannot be removed or hidden until you dismiss it. Any intelligent creature who sees the mark recognizes the bearer as an agent of chaos and anathema to civilization.
---`, starred: false },
		'Proclamation': { text: `*(Requires level 6+ and Condemn)*
When you **Censure**, you may denounce a group or faction as long as you can clearly identify them. Apply the effects of Censure to every member of that group, regardless of distance.
---`, starred: false },
		'Mirrorshield': { text: `*(Requires level 6+ and Aegis of Faith)*
When you **Defend** with a shield, you can spend 1 Readiness to intercept a magical force and redirect it to a different target (or none).
---`, starred: false },
		'Superior Stat': { text: `*(Requires level 6+)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
		'The Tower Eternal': { text: `*(Requires level 6+)*
When you **Defy Danger** against magic, treat a result of 6− as a 7–9.
---`, starred: false },
	},
	creationRules: { intro: '*You start with **Censure**, **Chronicler of Stonetop**, plus 2 more of your choice.*', die: 'd6', maxHP: 20, startingPickCount: 2,
		possessions: {
			pickCount: 1,
			always: ['Scribe\'s tools', 'Symbol of authority (choose 1)'],
			options: [
				{ name: 'Black iron maul (symbol of authority)', desc: 'Utterly immune to all magic; close, forceful, awkward, +1 damage.' },
				{ name: 'Makerglass shield (symbol of authority)', desc: 'Indestructible; +1 armor, +1 Readiness on Defend 7+.' },
				{ name: 'Helm with dark ice jewel (symbol of authority)', desc: 'Grants advantage to resist mind-affecting magic.' },
				{ name: 'Aviary', desc: 'Thick gloves, bird hoods, tethers, seed, messenger birds, birdcages.' },
				{ name: 'Carpenter\'s tools', desc: 'Chisels, files, nails, pitch, prybars, saws, firkins, barrels.' },
				{ name: 'Engineer\'s tools', desc: 'Rulers, tapes, rods, plumb-bobs, tripods, block & tackles, wheelbarrow.' },
				{ name: 'Smithy (or access to it)', desc: 'Iron goods, ingots, thick gloves, tongs, bellows, an anvil.' },
			],
		},
	},
};
playbooks.Judge = Judge;

const Lightbearer = {
	name: 'The Lightbearer',
	tagline: 'Imagine yourself and your kin in a cave lit by a single torch, entranced by shadow puppet stories. Imagine realizing there is a greater truth, and stepping out of the cave into the true Light of day. Would you not bring that Light back into the darkness, to set your people free?',
	backgrounds: {
		'Auspicious Birth': { text: `You were born in Stonetop, and that birth was marked by the God of Light. You were born during an eclipse, perhaps, or under the light of a bright new star? Maybe you bear a sun-shaped birthmark? Whatever the sign, your connection to Helior was clear early on. You've a place of honor in Stonetop, though it'd be a lie to say you don't make some uneasy.
When one of your moves has you mark a debility, you may mark this background's circle instead, to no ill effect. Clear it when you **Make Camp** or **Convalesce**.`, grants: [] },
		'Itinerant Mystic': { text: `They think of you as a self-important kook who comes through now and again, speaking in riddles and playing tricks with the light. Sure, they know there's something holy about you, but it's not like you're a priest or anything. Priests talk sense.
When you go off a-wandering, hold 1 Enigma if you're gone for days, 2 if you're gone for weeks, or 3 if you're gone for months. At the very start of play, hold 3 Enigma. Spend Enigma 1-for-1 to:
- Return from your wandering exactly when and where you are needed, fully Outfitted.
- **Know Things** as if you rolled a 10+, drawing on what you learned while away.
- **Have What You Need** to produce an oddly specific yet mundane item of Value 1 or less.`, grants: [] },
		'Soul on Fire': { text: `You once led a worldly life, full of fear and doubt, base pleasures and petty grudges. But something happened. Injury, illness, a brush with death. Or just a moment of such profound misery and self-loathing that you thought you could fall no further. There, in the dark, Helior's light shined upon you, igniting in your soul, lifting you and filling you with a profound sense of purpose.
When you **Persuade** a group by preaching charity, mercy, and hope and roll a 7+, aside from the usual effect, choose 1:
- Your name and your message spread.
- Someone approaches you, now or later, eager to know more.
---`, grants: [] },
	},
	instincts: {
		'Charity': 'To go without so that others are better off.',
		'Hope': 'To inspire others in the face of adversity.',
		'Mercy': 'To bring relief or comfort, to give second chances.',
		'Praise': 'To spread the glory and worship of Helior.',
		'Righteousness': 'To refuse to suffer an injustice or a lesser evil.',
	},
	startingMoves: {
		'Consecrated Flame': `When you whisper words of consecration to a flame, the flame casts a **holy light**. Holy light is uncomfortable for creatures of darkness to look upon, but does no true harm. The holy light lasts until the flame goes out or until you consecrate another flame, whichever comes first.
---`,
		'Invoke the Sun God': `When you imbue a holy light with Helior's power, choose an Invocation you know and roll +WIS:
- **10+:** It works as described, but you must choose 1 consequence from the list below.
- **7–9:** It works as described, but you and the GM each choose 1 consequence.
**Consequences:**
- The Invocation has its reduced effect.
- The effort taxes you; mark a debility.
- The light is snuffed out when the Invocation is complete, its fuel consumed.
- You must bask in sunlight for an hour or so before using that Invocation again.
*See the [Invocations insert](./Inserts/Invocations.md) for details.*
---`,
	},
	allMoves: {
		'Consecrated Flame': { text: `When you whisper words of consecration to a flame, the flame casts a **holy light**. Holy light is uncomfortable for creatures of darkness to look upon, but does no true harm. The holy light lasts until the flame goes out or until you consecrate another flame, whichever comes first.
---`, starred: true },
		'Invoke the Sun God': { text: `When you imbue a holy light with Helior's power, choose an Invocation you know and roll +WIS:
- **10+:** It works as described, but you must choose 1 consequence from the list below.
- **7–9:** It works as described, but you and the GM each choose 1 consequence.
**Consequences:**
- The Invocation has its reduced effect.
- The effort taxes you; mark a debility.
- The light is snuffed out when the Invocation is complete, its fuel consumed.
- You must bask in sunlight for an hour or so before using that Invocation again.
*See the [Invocations insert](./Inserts/Invocations.md) for details.*
---`, starred: true },
		'A Candle Against the Dark': { text: `When you wield a holy light but go otherwise unarmed, you have **2 Armor**.
---`, starred: false },
		'Luminous Shield': { text: `*(Requires A Candle Against the Dark)*
When you brandish a holy light to turn aside an attack against body, mind, or soul, roll +CHA:
- **10+:** The attack is deflected and, if the attacker is in range of your light, they are briefly blinded.
- **7–9:** The attack is deflected but your holy light flickers and dims, threatening to go out.
- **6−:** Your light snuffs out and the attack is unimpeded.
---`, starred: false },
		'All Is Illuminated': { text: `When you look closely on another and see their soul laid bare, roll +WIS:
- **10+:** Ask their player 1 question from the list below, plus *"And what would make them feel loved, beautiful, or worthy?"*
- **7–9:** Ask them 1 question from the list.
In any case, they must answer truthfully.
- Of what are they most ashamed?
- What do they most desire or covet?
- What hope have they abandoned?
- Who or what is most precious to them?
---`, starred: false },
		'And Behold a Pale Horse': { text: `When you spend the night gazing into a flame, ask the GM to reveal an impending doom or grim portent that will come to pass unless you intervene, and how you might yet do so.
---`, starred: false },
		'Fire Within': { text: `When you are in darkness, you are able to see by the light of your inner fire. When you take damage from cold or fire, reduce that damage by 2.
---`, starred: false },
		'Guiding Light': { text: `When you lead one or more NPCs through danger, roll +CHA:
- **10+:** You all make it through (Helior be praised).
- **7–9:** The GM will tell you what's required to get everyone through safely.
---`, starred: false },
		'Helior\'s Unblinking Eye': { text: `When you stare into the sun long enough to lose your vision, name a person or place that you know and roll +WIS:
- **10+:** You briefly glimpse your subject as if from a great height, and choose 2 from the list below.
- **7–9:** You briefly glimpse your subject as if from a great height, and choose 1.
**Choices:**
- The glimpse lasts as long as you wish.
- Your point of view shifts to very close range.
- You recover your vision quickly.
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'Keep the Home-Fires Burning': { text: `When you build a camp fire and sprinkle it with ash from your own hearth, anyone who **Makes Camp** with you is free from nightmares or bad dreams and recovers (extra) HP equal to your CHA.
---`, starred: false },
		'Lamplighter': { text: `When you whisper to a flammable object (a torch, a wick, kindling, etc.), it ignites in moments.
---`, starred: false },
		'Piety': { text: `When you spend at least an hour in proper worship to Helior, hold 1 Blessing. Other faithful PCs who partake in this worship also hold 1 Blessing. At any time, you can spend 1 Blessing to add +1 to a roll you just made in pursuit of a righteous cause.
---`, starred: false },
		'Purifying Flames': { text: `When you wield a holy light against a creature of darkness, it counts as a weapon (d10 damage, hand, close, area, 2 piercing) and you can choose to roll +WIS to **Clash**.
---`, starred: false },
		'Radiant Countenance': { text: `When you give someone your fond attention, you can then **Persuade** them with advantage. If they are a follower, you can instead choose to **Strengthen Your Bond** (as if you paid their cost).
---`, starred: false },
		'Rise Like the Sun': { text: `When you draw attention to yourself by word or deed, roll +CHA:
- **10+:** Everyone turns and looks, and you hold their gaze as long as you keep giving them reason to look.
- **7–9:** Everyone turns and looks.
---`, starred: false },
		'Spring\'s First Thaw': { text: `When you spend time (an hour at least, maybe more) seeking to stir hope, kindness, or mercy in an NPC, roll +CHA:
- **10+:** You light a fire deep within them and affect a lasting change.
- **7–9:** You kindle goodness in their heart for now, but they will eventually return to their old ways.
- **6−:** Their heart hardens and, whatever else the GM says, you can't use this move on them again.
---`, starred: false },
		'Burn Twice as Bright': { text: `*(Requires level 6+ and Invoke the Sun God)*
When you **Invoke the Sun God**, you may mark a debility to use 2 Invocations at once. Roll once, and apply any consequences to both Invocations.
---`, starred: false },
		'Empowered Invocations': { text: `*(Requires level 6+ and Invoke the Sun God)*
When you **Invoke the Sun God**, you can choose an extra consequence before you roll. If you do, the Invocation has its empowered effect.
---`, starred: false },
		'Glorious Servant': { text: `*(Requires level 6+ and Invoke the Sun God)*
When you **Invoke the Sun God** and roll a 10+, you need not choose a consequence. On a 7–9, you choose a consequence but the GM does not.
---`, starred: false },
		'Hungry Flames': { text: `*(Requires level 6+ and Purifying Flames)*
When you deal damage with a holy light, you deal +1d6 damage and your target is engulfed in holy light and flames.
---`, starred: false },
		'Light, More Light': { text: `*(Requires level 6+ and Consecrated Flame)*
When you consecrate a flame, it burns brighter than normal. A rushlight or candle illuminates to reach range, an oil lamp, lantern, or torch out to near range, and a bullseye lantern out to far range.
---`, starred: false },
		'Superior Stat': { text: `*(Requires level 6+)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
		'Wielder of the White Flame': { text: `*(Requires level 6+ and Invoke the Sun God)*
When you channel Helior's essence into an object you carry, roll +WIS:
- **10+:** It ignites with a white flame that casts a holy light (reach, area) and burns neither you nor the object, and you may **Invoke the Sun God** right now as if you rolled a 10+.
- **7–9:** It ignites with a white flame that casts a holy light (reach, area) and burns neither you nor the object.
---`, starred: false },
	},
	creationRules: { intro: '*You start with **Consecrated Flame** and **Invoke the Sun God**, plus 1 more of your choice.*', die: 'd6', maxHP: 18, startingPickCount: 1,
		possessions: {
			pickCount: 2,
			options: [
				{ name: 'Apiary', desc: 'Beeswax, candles (close, area, lasts ~1 hr), honey, bee smokers, hats & veils.' },
				{ name: 'Books & scrolls', desc: 'Expend a use to turn a Know Things roll into a 10+.' },
				{ name: 'Chandlery', desc: 'Beeswax, candles, wicks, scented herbs, soap, lye, ash.' },
				{ name: 'Distillery', desc: 'Fine whisky (uses grant advantage to Persuade), copper tubes, malt, stills, barrels.' },
				{ name: 'Glassworks', desc: 'Vials, charms, lenses, sand, marbles, bellows, crucible, lanterns.' },
				{ name: 'Holy relics', desc: 'Mark a use instead of choosing a consequence when Invoking the Sun God.' },
				{ name: 'Luthier\'s tools', desc: 'Chisels, files, catgut, various woods, stains, a lute, a fiddle.' },
			],
		},
	},
};
playbooks.Lightbearer = Lightbearer;

const Marshal = {
	name: 'The Marshal',
	tagline: 'Hoping for peace isn\'t enough. Trouble always comes knocking. And that\'s why we need you: to run the drills, to man the towers, to take charge when things get bad. To be cold enough to send your neighbors to a sure death in order to keep Stonetop safe. That\'s the job, Marshal. You up for it?',
	backgrounds: {
		'Scion': { text: `You grew up here, descended from a long line. Some of the biggest names in Stonetop's past are perched in your family tree. Everyone in the village takes your authority as a given, and your crew is a well-established institution in town.
You start with the **Veteran Crew** move, in addition to your usual moves. Go mark it now.
When you create your Crew, they automatically have the *respected* tag (in addition to your usual picks, and any you get from Veteran Crew).
---`, grants: ['Veteran Crew'] },
		'Penitent': { text: `Before you came here, you led a band of ne'er-do-wells: bandits, raiders, or bloody-handed mercenaries. But something changed. A moment of truth led you and your followers — some of them at least — to leave that life behind. And for whatever reason, the people of Stonetop took you in.
When you draw on your bloody past to **Know Things**, you may roll +STR instead of +INT. If you do, the GM will ask you who you wronged back then or who might still hold a grudge. Answer them now.
When you create your Crew, they automatically have the *warriors* tag (in addition to your usual picks).
---`, grants: [] },
		'Luminary': { text: `You're a natural leader — your words inspire, your plans win the day, your deeds are recounted far and wide. Are you touched by the gods? Does ancient blood flow in your veins? Or are you simply the champion that Stonetop needs in these trying times?
You start with the **We Happy Few** move, in addition to your usual moves. Go mark it now.
When you create your Crew, they automatically have the *devoted* tag (in addition to your usual picks).
---`, grants: ['We Happy Few'] },
	},
	instincts: {
		'Authority': 'To take charge and throw your weight around.',
		'Caution': 'To keep everyone safe, to agonize over decisions.',
		'Drive': 'To take on ever more responsibility.',
		'Honor': 'To keep your word, to follow a moral code.',
		'Ruthlessness': 'To do whatever it takes to win or survive.',
	},
	startingMoves: {
		'Crew': `You've got a crew of stalwarts, six or so residents of Stonetop with some steel to them. See the [Crew insert](./Inserts/Crew.md) for details.
---`,
		'Logistics': `When you have a steading **Muster** or **Pull Together**, or when you **Requisition**, you have advantage.
---`,
	},
	allMoves: {
		'Crew': { text: `You've got a crew of stalwarts, six or so residents of Stonetop with some steel to them. See the [Crew insert](./Inserts/Crew.md) for details.
---`, starred: true },
		'Logistics': { text: `When you have a steading **Muster** or **Pull Together**, or when you **Requisition**, you have advantage.
---`, starred: true },
		'Armored': { text: `When you carry a shield, mark only ☐ (instead of ☐☐). Also, you can ignore the *cumbersome* tag on any armor you wear.
If you take this move at the start of play, add an **iron hauberk**, **bronze cuirass**, or **scale coat** to your inventory (all are 2 armor, warm, cumbersome).
---`, starred: false },
		'Arts of War': { text: `*(Requires level 2+ and the Marshal)*
Take a move from the Fox, Heavy, Judge, Ranger, or Seeker playbooks, for which you otherwise qualify. You can pick from a different playbook each time. You can't take Improved Stat or Superior Stat.
---`, starred: false },
		'Veteran Crew': { text: `*(Requires Crew)*
Each time you take this move, pick 1. You can also choose to reselect their Instinct and Cost.
- Select 2 new tags for your Crew.
- Increase their damage die from d6 to d8.
- Increase their max HP by 2 each.
---`, starred: false },
		'Front Line Leader': { text: `When you lead your crew into battle, hold 2 Presence. Spend Presence in lieu of your crew's Loyalty or as Readiness (as if you **Defended** them).
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'Read the Land': { text: `When you first take a moment to survey the terrain, ask the GM one of the following; gain advantage on your next roll to act on the answer:
- What's the best way in, out, through, or past?
- Where's the best spot for a trap or an ambush?
- Where's the most defensible position?
- What here is out of place?
---`, starred: false },
		'Prepare a Welcome': { text: `*(Requires Read the Land)*
When you have your allies fortify a position and lie in wait for battle, hold 1 Surprise if you're rushed or 2 Surprises if you can take your time.
Once battle is joined, spend 1 Surprise to reveal a ploy, defense, or dirty trick you prepared in advance and roll +INT:
- **10+:** It works as well as can be expected, and you've still got a few tricks up your sleeve — regain 1 Surprise.
- **7–9:** It works as well as can be expected.
---`, starred: false },
		'Set-Up Strike': { text: `When you **Clash** and get a 7+, you can choose to deal damage with disadvantage. If you do, you create an opening for an ally to act on, as if you provided Aid. Describe it!
---`, starred: false },
		'Shake It Off': { text: `When you order an ally to overcome fear, pain, doubt, or delusion, roll +CHA:
- **10+:** They do it.
- **7–9:** A PC gets advantage to do it; an NPC will do it, but they'll need time, they'll resent you, or they'll feel humiliated (GM decides).
---`, starred: false },
		'Shield Wall': { text: `When you have your crew form a shield wall, they **Defend** with advantage and on a 7+ they hold +2 Readiness (instead of the usual +1 for shields). As long as they maintain formation, they can go on the offensive without losing Readiness.
---`, starred: false },
		'Sir, Permission to Die, Sir': { text: `When one of your followers would die, you can spend 1 of their Loyalty to have them survive (out of the action, but alive). If you let them go, mark XP.
---`, starred: false },
		'Speak Softly': { text: `When you offer peace but your enemy refuses, gain advantage on your next roll against them.
---`, starred: false },
		'Stentorian': { text: `When you raise your voice, it carries far and cuts through even the din of battle. When you go into battle, hold 2 Command. Spend 1 Command to shout an order or warning and pick 1:
- PCs get advantage on their next roll to do as you say.
- You have advantage to **Order Followers** or **Deploy**.
---`, starred: false },
		'Take the Measure': { text: `When you size someone up, ask their player one of the questions below and get an honest answer. If they fear or respect you (their call), you can ask another question. You can't use this move on them again until your relationship significantly changes.
- Can I trust them (to \\_\\_\\_)?
- What do they intend to do?
- How are they most useful/dangerous?
- What weakness of theirs can I exploit?
---`, starred: false },
		'We Happy Few': { text: `When you give an inspiring speech to your allies before facing a dire threat, roll +CHA:
- **10+:** Each ally holds 2 Inspiration.
- **7–9:** Each ally holds 1 Inspiration.
- **6−:** Each ally holds 1, but you have disadvantage on all rolls until you share your nagging doubts with someone else.
Once battle is joined, your allies can spend their Inspiration at any time, 1-for-1 to:
- Act fearlessly in the face of terror or overwhelming odds.
- Keep 1 HP instead of being reduced to 0 HP.
- Add 1d6 to a damage roll they just made.
---`, starred: false },
		'Battlefield Grace': { text: `*(Requires level 6+ and Front Line Leader)*
When you take damage while leading your allies in battle, the damage roll has disadvantage.
---`, starred: false },
		'Heroes to the Last': { text: `*(Requires level 6+ and Veteran Crew)*
Each time you take this move, pick 1:
- They are exceptional (and roll +2 instead of +1).
- They are inured to terror & horror.
- Increase their max HP by 4 each.
- Increase their damage die one size (max d10).
---`, starred: false },
		'Focus Fire': { text: `*(Requires level 6+ and Stentorian)*
You can spend 1 Command to order your allies to bring down a foe. If you do, each ally has advantage on their next damage roll against that foe.
---`, starred: false },
		'Like an Open Book': { text: `*(Requires level 6+ and Take the Measure)*
When you **Take the Measure** of someone who fears or respects you, your second question can be anything you want. The GM might ask how you could possibly know this; tell them or ask something else.
---`, starred: false },
		'Noble Mien': { text: `*(Requires level 6+)*
When you lead an NPC through danger and return them to safety, if they aren't part of your crew they will either offer to join your crew or pledge their future aid and support.
---`, starred: false },
		'Peace Through Strength': { text: `*(Requires level 6+ and Speak Softly)*
When you stand ready to fight alongside like-minded allies, anything capable of fear recognizes you as a serious threat and treats you accordingly.
---`, starred: false },
		'Superior Stat': { text: `*(Requires level 6+)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
	},
	creationRules: { intro: '*You start with **Crew**, **Logistics**, any moves from your Background, and 1 move of your choice.*', die: 'd6', maxHP: 20, startingPickCount: 1,
		possessions: {
			pickCount: 2,
			options: [
				{ name: 'Chirurgeon\'s tools', desc: 'Catgut, straps, bandages, tubes, poultice, willow bark, bonesaws.' },
				{ name: 'Distillery', desc: 'Fine whisky (uses grant advantage to Persuade), copper tubes, malt, stills, barrels.' },
				{ name: 'Engineer\'s tools', desc: 'Rulers, tapes, rods, plumb-bobs, tripods, block & tackles, wheelbarrow.' },
				{ name: 'Personal symbol', desc: 'A flag, crest, or marking; when displayed dramatically, crew holds +1 Loyalty (max 3).' },
				{ name: 'Scribe\'s tools', desc: 'Parchment, ink, pigments, vials, quills, a notebook.' },
				{ name: 'Weapons of war (choose up to 3)', desc: 'Sword (+1 dmg), Long spear (reach, 2 piercing), Battleaxe (messy), or Composite bow (far, +1 dmg).' },
			],
		},
	},
};
playbooks.Marshal = Marshal;

const Ranger = {
	name: 'The Ranger',
	tagline: 'Your true home is out there. Away from the Old Roads, in the wild places, where you\'ve faced storm and beast alike. But unknown forces are at work beyond the Ringwall, and you fear for your kith and kin. These are strange times. Guide them, Ranger, and keep them safe when darkness falls.',
	backgrounds: {
		'Mighty Hunter': { text: `You are a hunter of the Great Wood, the best the town has seen in generations. You know every part of the Wood within a two-day march.
You start with both the **Expert Tracker** move and the **Stalker** move. Go mark them now.
---`, grants: ['Expert Tracker', 'Stalker'] },
		'Wide Wanderer': { text: `You have travelled much of the known world and perhaps parts beyond. Add each of the following to the Neighbors list in the Stonetop playbook, choosing 1 trait for each:
- Ennis (from Marshedge)
- Shahar (from Gordin's Delve)
- Yannic (from the Hillfolk)
- Tovia (from Lygos)
- Sasca (from the northern Manmarch)
You start with the **Mental Map** move. Mark it now.
When you **Know Things** about the wider world, you can roll +WIS instead of +INT.
When you arrive somewhere you've visited before (your call), tell the GM when you were last here, and the GM will tell you how it's changed.
---`, grants: ['Mental Map'] },
		'Beast-Bonded': { text: `You grew up civilized, but your soul is bound to a beast of the wild. You're closer to it than to any man or woman. How did this bond come about? How long ago?
Regardless, you start with the **Animal Companion** move. Go mark it now.
When you focus on your animal companion for a few moments, you can use any of the actions you've marked below, no matter the distance between you. Mark 1 action at 1st level, then another at 3rd, 5th, 7th, and 9th.
- Gauge its distance and direction from you.
- Call it back to your side.
- Sense its emotional state.
- Get a brief impression of what it senses.
- Lend it your strength — lose 1d6 HP, and it regains an equal amount.
---`, grants: ['Animal Companion'] },
	},
	instincts: {
		'Adventure': 'To test yourself, to experience new things.',
		'Independence': 'To refuse help and push others away.',
		'Stewardship': 'To value beasts and natural places over people.',
		'Tenacity': 'To be stubborn, to persist.',
		'Wonder': 'To marvel at beauty, magnificence, splendor.',
	},
	startingMoves: {
		'Home on the Range': `When a journey requires you to **Defy Danger** or **Struggle as One**, treat a 6− as a 7–9.
---`,
	},
	allMoves: {
		'Home on the Range': { text: `When a journey requires you to **Defy Danger** or **Struggle as One**, treat a 6− as a 7–9.
---`, starred: true },
		'A Safe Place': { text: `When you select and prepare the party's camp site, hold 1 Precaution, or 2 Precaution if you are well-versed with this area and its dangers.
If trouble finds your camp site, you can spend 1 Precaution to reveal a simple defense, warning, or trick that you prepared in advance. If you do, tell us how you knew to make that specific preparation.
---`, starred: false },
		'Animal Companion': { text: `You are accompanied by a beast of uncommon loyalty and cleverness. See the [Animal Companion insert](./Inserts/Animal-Companion.md) for details.
---`, starred: false },
		'Magnificent Specimen': { text: `*(Requires Animal Companion)*
Each time you take this move, your companion gains 2 additional options of your choice.
---`, starred: false },
		'Big Game Hunter': { text: `When you strike at the weak spot of a large or huge creature, you deal +2 damage.
---`, starred: false },
		'Blot Out the Sun': { text: `When you **Let Fly** with a bow, you can deplete your ammunition (mark the next ammo status after your weapon) before you roll. If you do, choose 1:
- Gain advantage on your damage roll.
- Add the *area* tag to your attack; roll damage separately for each target.
---`, starred: false },
		'Call the Shot': { text: `When you take your time and calmly line up the perfect shot, either deal your damage or roll +DEX:
- **10+:** Deal your damage and pick 2.
- **7–9:** Deal your damage and pick 1.
**Choices:**
- Ignore armor or deal +1d4 damage (your call).
- Stun, hobble, or hinder them.
- Make them trip or drop what they're holding.
- Do no harm; don't deal your damage after all.
---`, starred: false },
		'Expert Tracker': { text: `When you **Seek Insight** by searching for or studying the signs left by passing creatures, you can ask *"What happened here recently?"* for free, even on a 6−.
When you follow a creature's trail, roll +WIS:
- **7+:** You follow it to a significant change in terrain or activity.
- **10+:** You can also ask the GM a reasonable question about your quarry and get a useful answer.
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'Mental Map': { text: `You can always retrace your steps and can accurately gauge distances and directions. You might not know the way forward but can always find your way back.
When you think back on a place you've been, you can **Seek Insight** retroactively, as if you were still there.
---`, starred: false },
		'Naturalist': { text: `When you **Know Things** about beasts, natural environs, or spirits of the wild, you have advantage.
---`, starred: false },
		'On the Hoof': { text: `When you travel through the wilderness, you can procure 1d6 uses of provisions each day (roll with disadvantage in winter or barren terrain). Provisions can substitute for supplies when you **Make Camp**.
---`, starred: false },
		'Pack Horse': { text: `You can carry up to ☐☐☐☐ with a light load, ☐☐☐☐☐☐☐ with a normal load, and ☐☐☐☐☐☐☐☐☐☐ with a heavy load.
---`, starred: false },
		'Pathfinder': { text: `When you lead your people to **Pull Together** or **Deploy** beyond sight of home, you have advantage.
---`, starred: false },
		'Predator': { text: `When you **Seek Insight**, add the following to the list of questions you can ask. When acting on the answer to either question, deal an extra 1d4 damage.
- Who or what here is the easiest prey?
- How is \\_\\_\\_ weak or vulnerable?
---`, starred: false },
		'Sniff Out Corruption': { text: `When you **Seek Insight**, you can ask *"What here stinks of the unnatural?"* for free, even on a 6−.
---`, starred: false },
		'Stalker': { text: `When you carry a normal or light load and move with care, you make no noise and leave no sign of your passing. When you hide yourself in a natural environment, you remain unseen until you draw attention to yourself, move positions, or attack.
---`, starred: false },
		'Survivalist': { text: `When you **Forage**, pick 1 extra choice (even on a 6−, pick 1) and add *"Find or fashion some useful item or supply (GM can veto)"* to the list of options.
---`, starred: false },
		'Warden of the Wild': { text: `When you defeat a perversion of nature, you can ask the GM 2 of the following and get a useful answer:
- Will it come back? If so, how can I stop it?
- Will its taint spread? If so, how can I contain it?
- What useful (but grisly) bits can I harvest?
- What else can I learn about it or its ilk?
---`, starred: false },
		'Wild Speech': { text: `The grunts, barks, chirps, and calls of natural beasts are as a language to you. You can understand their intentions and communicate basic ideas. When you **Persuade** a beast, you can choose to roll +WIS.
---`, starred: false },
		'Worldly': { text: `*(Requires level 2+ and the Ranger)*
Take a move from the Blessed, Fox, Heavy, Marshal, or Seeker playbooks, for which you otherwise qualify. You can pick from a different playbook each time. You can't pick Improved Stat or Superior Stat.
---`, starred: false },
		'Alpha': { text: `*(Requires level 6+, and Wild Speech or Spirit Tongue)*
When you assert dominance over another (beast, spirit, Fae, or person), roll +WIS:
- **7+:** They must pick 1 from the list below.
- **10+:** As above, and you also have advantage on your next roll against them.
**Choices:**
- Accept your authority, at least for now.
- Slink away or flee, then avoid you.
- Fight you for dominance.
---`, starred: false },
		'Beast of Legend': { text: `*(Requires level 6+ and Magnificent Specimen)*
Each time you take this move, pick 1:
- They are exceptional (and roll +2 instead of +1).
- They get +4 HP and +1 armor.
- They develop some unique ability or trait.
---`, starred: false },
		'Constant Vigilance': { text: `*(Requires level 6+)*
Unless you're dazed, you're never caught off guard — not even when asleep or if you roll a 6−. When you intercept a sudden threat (to yourself or an ally), you have advantage on whatever move you make.
---`, starred: false },
		'Giant Slayer': { text: `*(Requires level 6+ and Big Game Hunter)*
When you strike at a weak spot of a large or huge creature, you deal another +2 damage (+4 total).
---`, starred: false },
		'Superior Stat': { text: `*(Requires level 6+)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
		'Trailblazer': { text: `*(Requires level 6+; replaces Home on the Range)*
When a journey causes you to **Defy Danger** or **Struggle as One**, on a 10+ you also learn or discover something interesting and useful — ask the GM what.
---`, starred: false },
		'Walk It Off': { text: `*(Requires level 6+)*
When you'd mark a debility, you can mark this move instead to no ill effect. Clear it as you would a debility.
---`, starred: false },
	},
	creationRules: { intro: '*You start with **Home on the Range**, any moves from your Background, plus 1 of your choice.*', die: 'd6', maxHP: 18, startingPickCount: 1,
		possessions: {
			pickCount: 2,
			always: ['Composite bow'],
			options: [
				{ name: 'Distillery', desc: 'Fine whisky (uses grant advantage to Persuade), copper tubes, malt, stills, barrels.' },
				{ name: 'Hideouts', desc: 'Expend a use to have a well-stocked, safe shelter nearby.' },
				{ name: 'Husbandry tools', desc: 'Brushes, muzzles, collars, feed, whips, bridles. Advantage to Persuade domestic beasts.' },
				{ name: 'Hounds (2-3 followers)', desc: 'Trackers, keen-nosed, fast; HP 6; Damage d6 (hand, grabby).' },
				{ name: 'Lay of the land', desc: 'Expend a use to know where to find something without having to Know Things.' },
				{ name: 'Trapping gear', desc: 'Snares, pelts, musk, bait. When you Forage, get +1 use of provisions.' },
			],
		},
	},
};
playbooks.Ranger = Ranger;

const Seeker = {
	name: 'The Seeker',
	tagline: 'Look at us. Huddling behind our walls, hearing evil in every passing noise. Cowards, all. All, but you. You fear not the unknown. You plunge into it, searching. Grasping at what has been lost. What will you find, o Seeker? Signs of a bright new age? Or signs of our doom?',
	backgrounds: {
		'Patriot': { text: `These people are family. Chaos grows all around, but you'll be damned if you'll let your family come to harm. Damned indeed.
You have sought out and embraced dark power to protect that which you hold dear. Or perhaps that power fell upon you, and you took it up for the greater good. Either way, you seek more.
You start with the **Let's Make a Deal** move and are **Well Versed** in the Things Below (go mark them now). You've also acquired 1 major arcanum — choose one:
- The Hec'tumel Codex
- The Red Scepter
- The Staff of the Lidless Orb
---`, grants: ['Let\'s Make a Deal'] },
		'Antiquarian': { text: `The past has buried many secrets, and you are determined to dig them up. Years of study across the land have led you here, and you are convinced that this town holds the key to your greatest discoveries. What is it you hope to find? What is it that keeps you here?
Your travels and studies mean that you start with the **Polyglot** move and that you are **Well Versed** in the Makers and their arts (go mark them now). You've also acquired 1 major arcanum — choose one:
- Noruba's Ice Sphere
- The Azure Hand
- The Mindgem
---`, grants: ['Polyglot'] },
		'Witch Hunter': { text: `You've dedicated your life to rooting out and destroying horrors and their servants. What set you down this path? What did you sacrifice to walk it? What led you to call Stonetop home?
Regardless, you start with the **Everything Bleeds** move and are **Well Versed** in *(pick 1)* the Fae, the Things Below, or the Last Door and what lies beyond (go mark them now). You've also acquired 1 major arcanum — choose one:
- The Demonhide Cloak
- The Redwood Effigy
- The Twisted Spear
---`, grants: ['Everything Bleeds'] },
	},
	instincts: {
		'Cunning': 'To scheme, manipulate, and plot.',
		'Curiosity': 'To seek answers that maybe you oughtn\'t.',
		'Hubris': 'To assume you know best, that you can\'t fail.',
		'Mystery': 'To avoid straight answers; to keep secrets.',
		'Vision': 'To think big and pursue grandiose goals.',
	},
	startingMoves: {
		'Well Versed': `Mark 1 topic, in addition to the one noted in your Background. Each additional time you take this move, mark 2 more topics.
When you **Know Things** about one of your topics, you can ask the GM a follow-up question of your choice (even on a 6−).
**Topics:**
- The Last Door, death, and the undead
- The civilizations of humanity
- The Fae and their strange ways
- The Makers and their arts
- The primordial powers
- The Things Below
- The wild world and its spirits
---`,
		'Work With What You\'ve Got': `When you cleverly use your environment to harm or impede your foe(s), roll +INT:
- **10+:** Pick 2.
- **7–9:** Pick 1.
**Choices:**
- Interrupt or thwart their action(s).
- Create an opportunity that grants you or an ally advantage on the next roll to exploit it.
- Deal damage appropriate to the source (d4 for bruises/scrapes, d6 for bloodshed, d8 if it'd break bones, d10 if it'd kill a common person).
---`,
	},
	allMoves: {
		'Well Versed': { text: `Mark 1 topic, in addition to the one noted in your Background. Each additional time you take this move, mark 2 more topics.
When you **Know Things** about one of your topics, you can ask the GM a follow-up question of your choice (even on a 6−).
**Topics:**
- The Last Door, death, and the undead
- The civilizations of humanity
- The Fae and their strange ways
- The Makers and their arts
- The primordial powers
- The Things Below
- The wild world and its spirits
---`, starred: true },
		'Work With What You\'ve Got': { text: `When you cleverly use your environment to harm or impede your foe(s), roll +INT:
- **10+:** Pick 2.
- **7–9:** Pick 1.
**Choices:**
- Interrupt or thwart their action(s).
- Create an opportunity that grants you or an ally advantage on the next roll to exploit it.
- Deal damage appropriate to the source (d4 for bruises/scrapes, d6 for bloodshed, d8 if it'd break bones, d10 if it'd kill a common person).
---`, starred: true },
		'Attuned': { text: `When you **Seek Insight**, you can always ask *"What here is infused with magic?"* for free, even on a 6−.
---`, starred: false },
		'Conduit of Power': { text: `When you would mark a Consequence from a major arcanum, you can mark 1 box here instead, with no negative effect. *(These marks never clear.)*
---`, starred: false },
		'Countermeasures': { text: `When you witness a magical effect, you may ask the GM, *"How can this be countered or interrupted?"* and get an honest answer. You or an ally gain advantage on your next roll to act on the answer.
---`, starred: false },
		'Everything Bleeds': { text: `When you exploit an unnatural foe's specific weakness or vulnerability, deal +1d6 damage.
---`, starred: false },
		'Everything Burns': { text: `When you inspect a work of artifice or magic for a fatal flaw, roll +INT:
- **7+:** The GM will reveal the best way to destroy/sabotage it.
- **10+:** You or an ally also gain advantage to act on the info.
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'Initiate of the Secret Arts': { text: `*(Requires level 2+ and the Seeker)*
You have a "Sacred Pouch" (3 Stock, magical), as per the Blessed, but with no remarkable traits. Each time you take this move, choose a Blessed move for which you otherwise qualify. (You can't take Improved Stat or Superior Stat.)
---`, starred: false },
		'Let\'s Make a Deal': { text: `When you **Seek Insight**, add *"What do they really want or need?"* to the list of questions. When you **Persuade** by offering them something that you know they want or need, treat a 7–9 as a 10+.
---`, starred: false },
		'Logbook': { text: `You have a logbook (2 uses, slow) that doesn't take up space in your inventory. When you (and only you) consult your logbook and expend a use, you can ignore a Know Things roll you just made and treat the result as a 10+. When the Seasons Change, reset your logbook to 2 uses.
---`, starred: false },
		'Magpie': { text: `When you **Have What You Need**, you can produce something strange, specific, maybe even valuable or a little bit magical, but if you do, tell us where you got it and 2 of the following:
- How it's not quite right, but maybe it'll do?
- The trouble you caused back home by getting it.
- Why using it will draw unwanted attention.
- That it's the only thing like this that you've got, and why it'll only work the one time.
---`, starred: false },
		'Never at a Loss': { text: `When you **Know Things** and roll a 6−, you may choose to not mark XP. If you don't mark XP, the worst that happens is that the GM tells you nothing interesting or useful about the subject, but instead tells you how you could learn more.
---`, starred: false },
		'Polyglot': { text: `When you first encounter a living language in play, describe your proficiency with it (if any) and how you came to acquire it.
When you **Know Things** about any script, text, runes, or symbols that you encounter, you have advantage.
---`, starred: false },
		'Cryptologist': { text: `*(Requires Polyglot)*
When you study encoded, forgotten, or arcane marks or writing, roll +INT:
- **10+:** You can fully decipher them in just a few minutes.
- **7–9:** You get the gist in a few minutes, but fully deciphering them will take you an hour or so.
---`, starred: false },
		'Quick Study': { text: `When you study something magical that should take months to understand, it instead takes mere weeks. If it should take weeks, it takes days. If it should take days, it takes only a few hours.
---`, starred: false },
		'Safety First': { text: `When you spend an hour or so preparing your mystical defenses, hold 2 Protection. When you are affected by harmful magic, spend 1 Protection either to gain advantage on any roll to resist it or to halve its damage/effects.
---`, starred: false },
		'Sage Advice': { text: `When another PC asks you for guidance, they get advantage on their next roll to follow your advice.
---`, starred: false },
		'Arcane Adept': { text: `*(Requires level 6+)*
When you wish to invent a spell or magical effect, detail its workings with the GM and **Make a Plan** to invent it. If you like, pick one requirement and ask the GM to provide an alternative (for example, *"first you must \\_\\_\\_"* could become *"first you must \\_\\_\\_, or it will take months"*).
---`, starred: false },
		'Deep Insight': { text: `*(Requires level 6+ and Attuned)*
When you **Seek Insight** about something magical, you may ask one additional question, not limited to the list. Even on a 6−, you get to ask this question.
---`, starred: false },
		'Improvise': { text: `*(Requires level 6+ and Quick Study)*
When you wish to use an arcanum's move or option without having unlocked it, ask the GM what fool risk(s) it requires and/or what consequence(s) you'll incur. If you go for it, roll +INT:
- **7+:** You get it to work this once — trigger the move or use the option as if you'd unlocked it.
- **10+:** Also mark one step towards unlocking the arcanum's mysteries.
---`, starred: false },
		'Mind Over Magic': { text: `*(Requires level 6+)*
When you roll to study or use an arcanum, you can roll +INT instead of the stat you'd normally roll.
---`, starred: false },
		'Overchannel': { text: `*(Requires level 6+ and Conduit of Power)*
When you would mark a Consequence from a major arcanum, you may mark a debility instead.
---`, starred: false },
		'Proof Against Detection': { text: `*(Requires level 6+ and Safety First)*
When you hold Protection, you can't be scried upon or sensed by magical means, and have advantage to **Defy Danger** by being stealthy.
---`, starred: false },
		'Superior Stat': { text: `*(Requires level 6+)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
	},
	creationRules: { intro: '*You start with **Well Versed**, **Work With What You\'ve Got**, plus 1 from your Background.*', die: 'd6', maxHP: 16, startingPickCount: 0,
		possessions: {
			pickCount: 2,
			always: ['Scribe\'s tools'],
			options: [
				{ name: 'Books & scrolls', desc: 'Expend a use to turn a Know Things roll into a 10+.' },
				{ name: 'Distillery', desc: 'Fine whisky (uses grant advantage to Persuade), copper tubes, malt, stills, barrels.' },
				{ name: 'Engineer\'s tools', desc: 'Rulers, tapes, rods, plumb-bobs, tripods, block & tackles, wheelbarrow.' },
				{ name: 'Laboratory', desc: 'Chemics, reagents, vials, measures, scales, decanters. Each season d4-1 uses of naphtha.' },
				{ name: 'Paraphernalia', desc: 'Crystals, incense, talismans, blood, bone, horn, braziers, a cauldron.' },
				{ name: 'Trade contacts', desc: 'Small amounts of salt, glass, silk, spice, medicinal herbs, pigments, ivory.' },
			],
		},
	},
};
playbooks.Seeker = Seeker;

const WouldbeHero = {
	name: 'The Would-be-Hero',
	tagline: 'Most people hope for a quiet life. They spend their days a-worrying: about a leaky roof, a sick child, their crops. But you aren\'t like most people — you\'re on a different path. A path to adventure! There\'s greatness in you. Let\'s hope you live long enough for everyone else to see it.',
	backgrounds: {
		'Impetuous Youth': { text: `Stonetop has always been home, but you chafe at the demands of mundane life and have always longed for more. Excitement! Danger!
When you make a move and come up short, you can give it your all and turn a 6− into a 7–9, a 7–9 into a 10+, and (if it matters) a 10–11 into a 12+. But if you do, pick 1 (the GM will fill in the details):
- You get hurt (2d4 damage and an actual injury).
- You cause collateral damage, endanger others, or otherwise escalate the situation.
- Something on your person is lost or breaks.
---`, grants: [] },
		'Driven': { text: `You once led a simple life, but something happened. Something changed you, burdened you with terrible purpose. What was it? *(Choose 1)*
- A loved one was killed or abducted.
- Someone gave their life to save you.
- Your idol sacrificed themselves to save many.
- You stumbled upon a dark mystery.
- You must make amends for a terrible mistake.
You always have the option of **Burning Brightly**: you can spend 2 XP after you roll to add +1, even if you don't have enough XP to level.
---`, grants: [] },
		'Destined': { text: `Fate has laid her hand upon you. Choose 3–4 of the items below to describe your destiny:
| | | |
|---|---|---|
| anointed | marked at birth | your coming foretold |
| destroy | discover | free / protect / restore |
| unify | blood | civilization / darkness |
| earth & stone | fire | ice / light / life / storms |
| war | water | the Fae / the gods / the Makers |
| the Stone | the Things Below | |
At the start of a session, roll +Omens:
- **7+:** Lose all Omens, and the GM will describe a vision or portent that points toward your fate and/or clarifies your current situation.
- **10+:** As above, and also ask the GM a follow-up question and get a clear, helpful answer.
- **6−:** Don't mark XP, hold +1 Omen, and tell us of your recent nightmares or a troubling vision, and how your fears play into them.
Until your destiny is fulfilled, treat a 6− on Death's Door as a 7–9, and a 7–9 as a 10+.
---`, grants: [] },
	},
	instincts: {
		'Defiance': 'To refuse to back down, give up, give in.',
		'Doubt': 'To question yourself, your actions, your worth.',
		'Earnestness': 'To prove yourself, to yourself and others.',
		'Optimism': 'To assume the best, and that things are simple.',
		'Sacrifice': 'To put the needs/wants of others above your own.',
	},
	startingMoves: {
		'Anger Is a Gift': `When you burn with righteous anger *(see Fear & Anger section)*, hold 2 Resolve. You can spend your Resolve 1-for-1 to:
- Set aside fear and doubt to do what must be done.
- Act suddenly, catching them off-guard.
- Inspire allies or bystanders to follow your lead.
- Strike hard (+1d4 damage, forceful).
- Keep your footing, position, and/or your course despite what befalls you.
---`,
		'Potential for Greatness': `*(Requires the Would-be Hero)*
Once per level, when you roll a stat and get a 10+, mark one of the following (note the level during which you marked it). You don't have to mark them in order.
- ☐ Increase the stat you rolled by 1, to a max of +2 (at level \\_\\_\\_)
- ☐ Increase the stat you rolled by 1, to a max of +2 (at level \\_\\_\\_)
- ☐ Increase the stat you rolled by 1, to a max of +2 (at level \\_\\_\\_)
- ☐ Increase the stat you rolled by 1, to a max of +2 (at level \\_\\_\\_)
- ☐ Increase your max HP by 4 (at level \\_\\_\\_)
- ☐ Increase your damage die to a d8 (at level \\_\\_\\_)
---`,
	},
	allMoves: {
		'Anger Is a Gift': { text: `When you burn with righteous anger *(see Fear & Anger section)*, hold 2 Resolve. You can spend your Resolve 1-for-1 to:
- Set aside fear and doubt to do what must be done.
- Act suddenly, catching them off-guard.
- Inspire allies or bystanders to follow your lead.
- Strike hard (+1d4 damage, forceful).
- Keep your footing, position, and/or your course despite what befalls you.
---`, starred: true },
		'Speak Truth to Power': { text: `*(Requires Anger Is a Gift)*
When you demand that someone does what is clearly good and right, you have advantage to **Persuade**. If they refuse, gain +1 Resolve.
---`, starred: false },
		'Potential for Greatness': { text: `*(Requires the Would-be Hero)*
Once per level, when you roll a stat and get a 10+, mark one of the following (note the level during which you marked it). You don't have to mark them in order.
- ☐ Increase the stat you rolled by 1, to a max of +2 (at level \\_\\_\\_)
- ☐ Increase the stat you rolled by 1, to a max of +2 (at level \\_\\_\\_)
- ☐ Increase the stat you rolled by 1, to a max of +2 (at level \\_\\_\\_)
- ☐ Increase the stat you rolled by 1, to a max of +2 (at level \\_\\_\\_)
- ☐ Increase your max HP by 4 (at level \\_\\_\\_)
- ☐ Increase your damage die to a d8 (at level \\_\\_\\_)
---`, starred: true },
		'Better Part of Valor': { text: `When you are outnumbered or facing a foe bigger than you, you have advantage to hide from, escape from, or sneak past them.
---`, starred: false },
		'I Get Knocked Down': { text: `When you take damage despite your best efforts to avoid it, you can choose to halve the damage but pick 1 of the following:
- You lose something (footing, grip, etc.).
- Something on your person breaks.
- You're out of it for a moment.
Whatever you choose, the GM will describe the details.
---`, starred: false },
		'But I Get Up Again': { text: `*(Requires I Get Knocked Down)*
When you use **I Get Knocked Down**, you have advantage on your next roll against whatever dealt the damage, and your next blow against them does +1d4 damage.
---`, starred: false },
		'Improved Stat': { text: `Each time you take this move, increase one of your stats by 1 (to a max of +2).
---`, starred: false },
		'In Over Your Head': { text: `When another PC rescues you from danger, mark XP.
---`, starred: false },
		'Iron Will': { text: `When you are subject to mind control or magic that affects your feelings, you can take 1d4 damage (ignoring armor) to disregard its influence.
---`, starred: false },
		'Inquiring Minds': { text: `When you seek out and receive honest advice, gain advantage on your next roll to follow that advice.
---`, starred: false },
		'Never Gonna Keep Me Down': { text: `When you have 5 or fewer current HP, you impose disadvantage on any damage you take.
Once per session, when you are at Death's Door, don't roll. You get a 10+.
---`, starred: false },
		'Resourceful': { text: `When you **Defy Danger** and roll a 6−, ask the GM a question from **Seek Insight** after they describe what happens. Gain advantage on your next roll to act on the answer.
---`, starred: false },
		'Something to Remember Me By': { text: `When you spend Readiness (from **Defend**) to strike back at an attacker, you deal +1d4 damage and scar, mark, or diminish them in some way (the GM will say how, or ask you to).
---`, starred: false },
		'Tough Love': { text: `When you honestly think another PC is in the wrong and call them on it, they have disadvantage on any rolls against you until you two work it out.
---`, starred: false },
		'Underestimated': { text: `As long as you avoid overt hostility, no enemy will consider you a threat.
When you first make your move against an enemy who underestimates you, you have advantage.
---`, starred: false },
		'Up With People': { text: `When you converse with someone (PC or NPC) you can hold 2 Rapport with them. If you do, they hold 1 Rapport with you. During the conversation, either of you can spend 1 Rapport to ask the other player one of the following and get an honest answer:
- What weighs you down or holds you back?
- What drives you forward?
- What lesson would you have me learn?
- What do you think of me, truly?
---`, starred: false },
		'Versatile': { text: `*(Requires level 2+ and the Would-be Hero)*
Choose a move from any other playbook, as long as you meet its requirements. You can pick from a different playbook each time. You can't take Improved Stat or Superior Stat.
---`, starred: false },
		'A Force to Be Reckoned With ★': { text: `*(Requires level 6+; replaces Underestimated)*
Any intelligent creature who looks you in the eye or hears the steel in your voice instinctively knows that you are a force to be reckoned with, and treats you appropriately.
When you **Defy Danger** against something trying to harm or constrain you, on a 12+ you turn the tables on them (the GM will say how, or ask you to).
---`, starred: false },
		'Big Damn Hero ★': { text: `*(Requires level 6+; replaces In Over Your Head)*
When you first leap into danger to protect someone, don't roll to **Defend**. Instead, treat it as though you rolled a 10+.
When you **Defend**, you can spend 1 Readiness to lock eyes with an attacker; they have disadvantage on damage rolls against you and your ward for the rest of the fight.
---`, starred: false },
		'Superior Stat': { text: `*(Requires all 6 marks in Potential for Greatness)*
Increase one of your stats by +1 (to a max of +3).
---`, starred: false },
		'Undaunted ★': { text: `*(Requires level 6+; replaces Better Part of Valor)*
When you are outnumbered or facing a foe bigger than you, you get +1 armor and deal +1d6 damage.
---`, starred: false },
		'Voice of Experience ★': { text: `*(Requires level 6+; replaces Inquiring Minds)*
When another PC comes to you for advice and you tell them what you think is best, they have advantage on their first roll to follow your advice.
When you **Seek Insight**, you can always ask *"What is about to happen?"* for free, even on a 6−.
> **★** The first time you use any move marked with a star (★), cross off "Would-be" on the front page.
---`, starred: false },
	},
	creationRules: { intro: '*You start with **Anger Is a Gift**, **Potential for Greatness**, and 2 other moves of your choice.*', die: 'd6', maxHP: 16, startingPickCount: 2,
		possessions: {
			pickCount: 2,
			options: [
				{ name: 'A heap of expectations', desc: 'Of little use, but heavy.' },
				{ name: 'A good dog (follower)', desc: 'Retriever or herder, keen-nosed, clever; HP 6; Damage d6 (hand, grabby).' },
				{ name: 'Husbandry tools', desc: 'Brushes, muzzles, collars, feed, whips, bridles. Advantage to Persuade domestic beasts.' },
				{ name: 'Smithy (or access to it)', desc: 'Iron goods, ingots, thick gloves, tongs, bellows, an anvil.' },
				{ name: 'Stoneworker\'s tools', desc: 'Chisels, drills, prybars, spikes, block & tackles, wheelbarrow.' },
				{ name: 'Personal token (fraught with meaning)', desc: 'A shield, cloak, letter, flute, locket, or tinderbox — freighted with memory.' },
				{ name: 'Tannery (or access to it)', desc: 'Lime, acid, salts, thick gloves, a boiled leather cuirass (1 armor).' },
			],
		},
	},
};
playbooks.WouldbeHero = WouldbeHero;
