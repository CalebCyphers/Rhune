/**
 * Represents a Player Character (PC) in Stonetop.
 * Based on Citation 1: Playbooks serve as character sheets tracking 
 * stats, debilities, HP, XP, and moves.
 */

const examplePC = {
    name: "Will",
    playbook: "Fox",
    hp: 10,
    xp: 0,
    debilities: [],
    moves: [],
    insertData: {},
    stats: {
        strength: 1,
        dexterity: 1,
        constitution: 1,
        intelligence: 1,
        wisdom: 1,
        charisma: 1,
    }

}
class PlayerCharacter {
    constructor(name, playbookType, insertData = {}) {
        this.name = name;
        // Standard playbooks include: Blessed, Fox, Heavy, Judge, Lightbearer, Marshal, Ranger, Seeker, Would-be Hero
        this.playbook = playbookType; 
        this.hp = 10; // Default starting HP (can be adjusted based on moves)
        this.xp = 0;
        this.debilities = []; // List of special conditions or limitations
        this.moves = []; // Array of unique abilities/actions
        
        // "Each PC also has at least one insert" (Citation 1)
        this.insertData = insertData;

        // Core attributes typically found in a playbook
        this.stats = {
        strength: 0,
        dexterity: 0,
        constitution: 0,
        intelligence: 0,
        wisdom: 0,
        charisma: 0,
    }
    }

    takeDamage(amount) {
        this.hp -= amount;
        console.log(`${this.name} takes ${amount} damage. Current HP: ${this.hp}`);
    }

    
}

/**
 * Represents the "Steading" or Homefront area.
 * Based on Citation 3's "Homefront" section and the concept 
 * that Stonetop is a community where "everyone shares."
 */
class Steading {
    constructor(name) {
        this.name = name; // e.g., "The Village of Stonetop" or a specific farmstead
        this.resources = {
            food: 100,
            materials: 100,
            medicine: 10
        };
        this.communityStanding = 50; // Represents the "all for one" community vibe
        this.currentThreatLevel = 0; // Based on the "darkening world" mentioned in Citation 3
    }

    consumeResources(type, amount) {
        if (this.resources[type] >= amount) {
            this.resources[type] -= amount;
            return true;
        }
        return false;
    }
}

/**
 * The main Game engine/state class.
 * Handles the overarching logic for a session of Stonetop.
 */
class StonetopGame {
    constructor(gameName) {
        this.gameName = gameName;
        this.players = []; // Array of PlayerCharacter objects
        this.steading = new Steeding(); // The central location/home base
        this.currentLocation = "Stonetop Village";
        this.currentScene = "The First Bloom"; // Based on the intro in Citation 3
    }

    addPlayer(pc) {
        this.players.push(pc);
    }

    // Logic for rolling dice (Citation 2: d4, d6, d8, d10, d12)
    rollDice(diceString) {
        // Example input: "2d6" or "d10+1"
        // This would parse the string and return the result.
        console.log(`Rolling ${diceString}...`);
        return Math.floor(Math.random() * 6) + 1; // Simplified for example
    }

    // Logic for "The Game Ongoing" (Citation 3, page 571)
    updateWorldState(event) {
        console.log(`World Event: ${event}`);
        // Update threat levels or community standing based on events
    }
}

// Example Usage for the Discord Bot:
const game = new StonetopGame("The Shadow of the Stone");
const player1 = new PlayerCharacter("Elowen", "The Fox");
const player2 = new PlayerCharacter("Kael", "The Seeker"); // Note: Seekers have unique risk of "Personal Corruption"

game.addPlayer(player1);
game.addPlayer(player2);

console.log(`Welcome to ${game.gameName}!`);
console.log(`${player1.name} is playing as ${player1.playbook}.`);
