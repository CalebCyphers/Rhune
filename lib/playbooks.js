const playbooks = {};

function keyOf(raw) {
	if (!raw) return null;
	const n = String(raw).trim().toLowerCase().replace(/^(the |the-)/, '').replace(/[^a-z0-9]/g, '');
	// Accept both "blessed" and "theblessed" forms
	for (const k of Object.keys(playbooks)) {
		const clean = k.replace(/[^a-z0-9]/g, '');
		if (clean === n) return k;
	}
	return null;
}

function lookupPlaybook(rawName) {
	const k = keyOf(rawName);
	return k ? playbooks[k] : null;
}

function renderPlaybookEmbed(record) {
	const pb = lookupPlaybook(record.playbook);
	if (!pb) return null;

	const { EmbedBuilder } = require('discord.js');
	const embed = new EmbedBuilder()
		.setTitle(`${record.name} — ${pb.name}`)
		.setDescription(pb.tagline)
		.addFields(
			{
				name: 'Backgrounds',
				value: pb.backgrounds.map(b => `• ${b}`).join('\n'),
				inline: false,
			},
			{
				name: 'Starting Moves',
				value: pb.startingMoves.map(m => `• ${m}`).join('\n'),
				inline: false,
			},
			{
				name: 'Instincts',
				value: pb.instincts.map(i => `• ${i}`).join('\n'),
				inline: false,
			},
		)
		.setFooter({ text: `Sheet for ${record.name}` })
		.setTimestamp(new Date());
	return embed;
}

// ===== Playbook Definitions =====

const Blessed = {
	name: 'The Blessed',
	tagline: 'Danu, the Great Mother, provides. We need only learn her secrets: the names by which the trees call each other; the mark made with redberry juice to ward off impure spirits; the language of the wolves. A thousand such secrets Danu keeps, to share with only her true children. Her Blessed.',
	backgrounds: ['Initiate', 'Raised by Wolves', 'Vessel'],
	startingMoves: ['Spirit Tongue', 'Call the Spirits (requires Spirit Tongue)', '+ 1 from your Background', '+ 1 of your choice'],
	instincts: ['Delight — To find beauty, in even the most ugly thing.', 'Detachment — To remain unmoved, to be cold as winter.', 'Nurture — To help others grow, learn, or improve.', 'Preservation — To protect the natural world.', 'Reverence — To demand sacrifice to the spirits and Danu.'],
};
playbooks.Blessed = Blessed;

const Fox = {
	name: 'The Fox',
	tagline: 'The elders tell a story about Fox, who knows lots of tricks, and Hedgehog, who knows one: how to curl up into a ball when there\'s danger. Fox can\'t eat Hedgehog when he\'s all curled up, so in the story Fox goes hungry. But you\'re not that Fox, and this is no story. You want that Hedgehog? Go get a knife.',
	backgrounds: ['The Natural', 'A Life of Crime', 'The Prodigal Returned'],
	startingMoves: ['Ambush OR Skill at Arms', 'Danger Sense OR Perceptive', '+ 1 of your choice', 'Also: Burgle OR Light Fingers (extra move)'],
	instincts: ['Conscience — To do the right thing, even when it hurts.', 'Freedom — To throw off bonds and restrictions.', 'Comfort — To secure your own safety and ease.', 'Prestige — To be known, admired, and feared.', 'Trickery — To deceive and manipulate for the thrill.'],
};
playbooks.Fox = Fox;

const Heavy = {
	name: 'The Heavy',
	tagline: 'These are good people. Hard-working, honest. They look out for each other. But sometimes, looking out for each other ain\'t enough. Sometimes, good people need someone to stick up for them. Someone who\'s not afraid to get a little bloody. To get heavy. Yeah, someone like you.',
	backgrounds: ['Sheriff', 'Blood-Soaked Past', 'Storm-Marked'],
	startingMoves: ['Dangerous', 'Hard to Kill', '+ 1 of your choice'],
	instincts: ['Peace — To protect peace through strength.', 'Pride — To prove your worth, again and again.', 'Recklessness — To leap before you look.', 'Trouble — To look for a fight when there is none.', 'Violence — To solve problems by breaking things (and people).'],
};
playbooks.Heavy = Heavy;

const Judge = {
	name: 'The Judge',
	tagline: 'Look here at this little town, this candleflame in the darkness. Its very existence is an act of courage and faith. And Aratis has charged you to keep it: to settle its disputes; to chronicle its tales; to defend it from darkness and ruin. Take up your hammer, Judge. Your town needs you.',
	backgrounds: ['Legacy', 'Missionary', 'Prophet'],
	startingMoves: ['Censure', 'Chronicler of Stonetop', '+ 1 of your choice'],
	instincts: ['Ambition — To build lasting power and influence.', 'Dispassion — To stay objective, never ruled by emotion.', 'Harmony — To smooth over conflict and keep the peace.', 'Orthodoxy — To uphold the law, letter and spirit.', 'Zeal — To pursue your cause with fire and fury.'],
};
playbooks.Judge = Judge;

const Lightbearer = {
	name: 'The Lightbearer',
	tagline: 'Imagine yourself and your kin in a cave lit by a single torch, entranced by shadow puppet stories. Imagine realizing there is a greater truth, and stepping out of the cave into the true Light of day. Would you not bring that Light back into the darkness, to set your people free?',
	backgrounds: ['Auspicious Birth', 'Itinerant Mystic', 'Soul on Fire'],
	startingMoves: ['Consecrated Flame', 'Invoke the Sun God', '+ 1 of your choice'],
	instincts: ['Charity — To give freely, expecting nothing in return.', 'Hope — To kindle hope in the hopeless.', 'Mercy — To spare and forgive, even the undeserving.', 'Praise — To celebrate the Light and those who serve it.', 'Righteousness — To burn away corruption, no matter the cost.'],
};
playbooks.Lightbearer = Lightbearer;

const Marshal = {
	name: 'The Marshal',
	tagline: 'Hoping for peace isn\'t enough. Trouble always comes knocking. And that\'s why we need you: to run the drills, to man the towers, to take charge when things get bad. To be cold enough to send your neighbors to a sure death in order to keep Stonetop safe. That\'s the job, Marshal. You up for it?',
	backgrounds: ['Scion', 'Penitent', 'Luminary'],
	startingMoves: ['Crew', 'Logistics', '+ 1 of your choice'],
	instincts: ['Authority — To be in charge, to give orders, to be obeyed.', 'Caution — To avoid unnecessary risk.', 'Drive — To push forward, ever onward.', 'Honor — To keep your word, protect your people.', 'Ruthlessness — To do what must be done, whatever the cost.'],
};
playbooks.Marshal = Marshal;

const Ranger = {
	name: 'The Ranger',
	tagline: 'Your true home is out there. Away from the Old Roads, in the wild places, where you\'ve faced storm and beast alike. But unknown forces are at work beyond the Ringwall, and you fear for your kith and kin. These are strange times. Guide them, Ranger, and keep them safe when darkness falls.',
	backgrounds: ['Mighty Hunter', 'Wide Wanderer', 'Beast-Bonded'],
	startingMoves: ['Home on the Range', '+ 1 of your choice'],
	instincts: ['Adventure — To see what\'s over the next hill.', 'Independence — To answer to no one.', 'Stewardship — To protect the wild and all who dwell there.', 'Tenacity — To never, ever give up.', 'Wonder — To marvel at the world, and its hidden beauty.'],
};
playbooks.Ranger = Ranger;

const Seeker = {
	name: 'The Seeker',
	tagline: 'Look at us. Huddling behind our walls, hearing evil in every passing noise. Cowards, all. All, but you. You fear not the unknown. You plunge into it, searching. Grasping at what has been lost. What will you find, o Seeker? Signs of a bright new age? Or signs of our doom?',
	backgrounds: ['Patriot', 'Antiquarian', 'Witch Hunter'],
	startingMoves: ['Well Versed', 'Work With What You\'ve Got', '+ 1 of your choice'],
	instincts: ['Cunning — To outthink and outmaneuver.', 'Curiosity — To know the truth, whatever it costs.', 'Hubris — To prove you are the smartest in the room.', 'Mystery — To guard secrets and keep them hidden.', 'Vision — To see beyond, and show others the way.'],
};
playbooks.Seeker = Seeker;

const WouldbeHero = {
	name: 'The Would-be Hero',
	tagline: 'Most people hope for a quiet life. They spend their days a-worrying: about a leaky roof, a sick child, their crops. But you aren\'t like most people — you\'re on a different path. A path to adventure! There\'s greatness in you. Let\'s hope you live long enough for everyone else to see it.',
	backgrounds: ['Impetuous Youth', 'Driven', 'Destined'],
	startingMoves: ['Anger Is a Gift', 'Potential for Greatness', '+ 1 of your choice'],
	instincts: ['Defiance — To refuse, rebel, and rise up.', 'Doubt — To question everyone — including yourself.', 'Earnestness — To mean what you say, with all your heart.', 'Optimism — To believe, against all evidence, that it\'ll work out.', 'Sacrifice — To give everything for the ones you love.'],
};
playbooks.WouldbeHero = WouldbeHero;

module.exports = {
	lookupPlaybook,
	renderPlaybookEmbed,
};
