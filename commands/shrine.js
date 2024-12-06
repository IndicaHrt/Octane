const { SlashCommandBuilder } = require('discord.js');
const { getLogger } = require('../utils/logging');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { getShrineEmbed } = require('../utils/getEmbed');
const { calculateShrineLevel, updateStats } = require('../utils/main');

// Create new blessing categories and levels with updated stats
// speed, acceleration, grip, suspension, brakes, fuelCapacity, currentFuel, durability, aerodynamics, torque, horsepower
const BLESSING_CATEGORIES = {
    speed: {
        name: "Speed",
        effects: ["speed"]
    },
    acceleration: {
        name: "Acceleration",
        effects: ["acceleration"]
    },
    grip: {
        name: "grip",
        effects: ["grip"]
    },
    leadfoot: {
        name: "Leadfoot",
        effects: ["speed", "acceleration"]
    },
    cornering: {
        name: "Cornering",
        effects: ["grip", "acceleration"]
    },
    fuelSaver: {
        name: "Fuel Saver",
        effects: ["fuelEfficiency", "speed"]
    },
    lucky: {
        name: "Lucky",
        effects: ["luck", "speed"]
    },
    durability: {
        name: "Durability",
        effects: ["durability"]
    },
    aerodynamics: {
        name: "Aerodynamics",
        effects: ["aerodynamics"]
    },
    torque: {
        name: "Torque",
        effects: ["torque"]
    },
    horsepower: {
        name: "Horsepower",
        effects: ["horsepower"]
    },
    brakes: {
        name: "Brakes",
        effects: ["brakes"]
    },
    intuition: {
        name: "Intuition",
        effects: ["luck", "grip"]
    },
    speedDemon: {
        name: "Speed Demon",
        effects: ["speed", "horsepower"]
    },
    endurance: {
        name: "Endurance",
        effects: ["durability", "aerodynamics"]
    },
    precision: {
        name: "Precision",
        effects: ["brakes", "torque"]
    },
    accelerationGod: {
        name: "Acceleration God",
        effects: ["acceleration", "torque"]
    },
    gripMaster: {
        name: "Grip Master",
        effects: ["grip", "aerodynamics"]
    },
    fuelEconomy: {
        name: "Fuel Economy",
        effects: ["fuelEfficiency", "durability"]
    },
    luck: {
        name: "Luck",
        effects: ["luck"]
    },
    speedster: {
        name: "Speedster",
        effects: ["speed", "grip"]
    },
    horsepowerGod: {
        name: "Horsepower God",
        effects: ["horsepower", "torque"]
    }
};

const BLESSING_LEVELS = {
    1: { multiplier: 1, effects: 1 },
    2: { multiplier: 2, effects: 1 },
    3: { multiplier: 3, effects: 1 },
    4: { multiplier: 5, effects: 1 },
    5: { multiplier: 10, effects: 2 }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shrine')
        .setDescription('View and manage your player blessings.'),
    category: 'General',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        if (!profile) {
            await interaction.reply({ content: "You need to create a profile view shrine.", ephemeral: true });
            return;
        }
        
        try {
            if (!profile.blessings || profile.blessings.length === 0) {
                profile.blessings = [{
                    active: false,
                    locked: false,
                    level: 1,
                    type: null,
                    lastUpdated: DateTime.now().setZone('America/New_York').toJSDate(),
                    stats: {
                        speed: 0.0,
                        acceleration: 0.0,
                        grip: 0.0,
                        suspension: 0.0,
                        brakes: 0.0,
                        durability: 0.0,
                        aerodynamics: 0.0,
                        torque: 0.0,
                        horsepower: 0.0,
                        luck: 0.0,
                        fuelEfficiency: 0.0
                    }
                }, {
                    active: false,
                    locked: false,
                    level: 1,
                    type: null,
                    lastUpdated: DateTime.now().setZone('America/New_York').toJSDate(),
                    stats: {
                        speed: 0.0,
                        acceleration: 0.0,
                        grip: 0.0,
                        suspension: 0.0,
                        brakes: 0.0,
                        durability: 0.0,
                        aerodynamics: 0.0,
                        torque: 0.0,
                        horsepower: 0.0,
                        luck: 0.0,
                        fuelEfficiency: 0.0
                    }
                }, {
                    active: false,
                    locked: false,
                    level: 1,
                    type: null,
                    lastUpdated: DateTime.now().setZone('America/New_York').toJSDate(),
                    stats: {
                        speed: 0.0,
                        acceleration: 0.0,
                        grip: 0.0,
                        suspension: 0.0,
                        brakes: 0.0,
                        durability: 0.0,
                        aerodynamics: 0.0,
                        torque: 0.0,
                        horsepower: 0.0,
                        luck: 0.0,
                        fuelEfficiency: 0.0
                    }
                }, {
                    active: false,
                    locked: false,
                    level: 1,
                    type: null,
                    lastUpdated: DateTime.now().setZone('America/New_York').toJSDate(),
                    stats: {
                        speed: 0.0,
                        acceleration: 0.0,
                        grip: 0.0,
                        suspension: 0.0,
                        brakes: 0.0,
                        durability: 0.0,
                        aerodynamics: 0.0,
                        torque: 0.0,
                        horsepower: 0.0,
                        luck: 0.0,
                        fuelEfficiency: 0.0
                    }
                }, {
                    active: false,
                    locked: false,
                    level: 1,
                    type: null,
                    lastUpdated: DateTime.now().setZone('America/New_York').toJSDate(),
                    stats: {
                        speed: 0.0,
                        acceleration: 0.0,
                        grip: 0.0,
                        suspension: 0.0,
                        brakes: 0.0,
                        durability: 0.0,
                        aerodynamics: 0.0,
                        torque: 0.0,
                        horsepower: 0.0,
                        luck: 0.0,
                        fuelEfficiency: 0.0
                    }
                }];
                await profile.save();
            }

            let e = await getShrineEmbed(profile);

            const message = await interaction.reply({ embeds: [e.embed], components: e.rows, fetchReply: true });
            const filter = i => i.user.id === interaction.user.id && (i.customId === 'b1' || i.customId === 'b2' || i.customId === 'b3' || i.customId === 'b4' || i.customId === 'b5' || i.customId === 'getBlessing');
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 'getBlessing') {
                    //console.log('getBlessing');
                    const blessing = await generateBlessing(profile);
                    console.log('blessing', blessing);
                    const openBlessing = profile.blessings.find(blessing => !blessing.locked);
                    if (!openBlessing) {
                        console.log('no open blessings');
                        return i.update({ content: 'You already have 5 locked blessings. Please unlock one before getting a new one.', ephemeral: true });
                    }

                    openBlessing.active = true;
                    openBlessing.type = blessing.type;
                    openBlessing.stats = blessing.stats;
                    openBlessing.level = blessing.level;
                    openBlessing.lastUpdated = DateTime.now().setZone('America/New_York').toJSDate();
                    profile.feastSupplies -= 100;
                    profile.shrineXP += 5;
                    await profile.save();

                    await updateStats(profile);

                    e = await getShrineEmbed(profile);
                    await i.update({ content: `You received a blessing: **${blessing.type}**!`, embeds: [e.embed], components: e.rows, fetchReply: true });
                }
            });

            collector.on('end', async () => {
                e = await getShrineEmbed(profile);
                await message.edit({ embeds: [e.embed], components: [] });
            });
        } catch (err) {
            logger.error(interaction.user.tag + ' | feast: ' + err);
            return interaction.reply('An error occurred while processing the shrine command.', { ephemeral: true });
        }
    }
};

async function generateBlessing(profile) {
    const shrineLvl = await calculateShrineLevel(profile.shrineXP);
    //console.log('shrineLvl', shrineLvl);
    const levelOdds = await calculateLevelOdds(shrineLvl);
    //console.log('levelOdds', levelOdds);
    const blessingLevel = await pickBlessingLevel(levelOdds);
    //console.log('blessingLevel', blessingLevel);
    const category = await pickRandomCategory();
    //console.log('category', category);
    const stats = await assignBlessingStats(blessingLevel, category);
    return stats;
}

async function calculateLevelOdds(shrineLevel) {
    const oddsConfig = {
        0: [100, 0, 0, 0, 0],
        1: [95, 4, 1, 0, 0],
        2: [85, 10, 5, 0, 0],
        3: [75, 15, 10, 0, 0],
        4: [50, 25, 20, 5, 0],
        5: [25, 25, 25, 20, 5]
    };
    return oddsConfig[shrineLevel];
}

async function pickBlessingLevel(odds) {
    let random = Math.random() * 100;
    let sum = 0;
    for (let i = 0; i < odds.length; i++) {
        sum += odds[i];
        if (random < sum) return i + 1;
    }
    return 1;
}

async function pickRandomCategory() {
    const categories = Object.keys(BLESSING_CATEGORIES);
    const randomIndex = Math.floor(Math.random() * categories.length);
    return BLESSING_CATEGORIES[categories[randomIndex]];
}

async function assignBlessingStats(level, category) {
    const effectsToAssign = BLESSING_LEVELS[level].effects;
    const stats = {};
    for (let i = 0; i < effectsToAssign; i++) {
        const effect = category.effects[Math.floor(Math.random() * category.effects.length)];
        stats[effect] = (stats[effect] || 0) + BLESSING_LEVELS[level].multiplier;
    }
    return {
        type: category.name,
        stats: stats,
        level: level
    };
}