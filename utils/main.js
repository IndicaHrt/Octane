// Description: Utility functions for xp, coins, and fuel related operations.
const { DateTime } = require('luxon');
const { getLogger } = require('./logging');
const { Profile, Job, GuildSettings, Item, Challenge } = require('../models');
const { plugin } = require('mongoose');

// Main functions

async function calculateLevel(xp) {
    let logger = await getLogger();
    let level = 0;
    let totalXp = 0;
    let xpForNextLevel = 1200; // Initial XP needed for the first level
    let levelOffset = 50;
    let levelMultiplier = 10;
    let maxLevel = 20;

    if (xp < 0) {
        logger.warn(`Invalid XP value: ${xp}`);
        xp = 0;
    }

    if (xp === 0) {
        return {
            level: 0,
            currentLevelXp: 0,
            remainingXp: 1200,
            nextLevelXp: 1200,
            progress: 0
        };
    }

    while (totalXp <= xp && level < maxLevel) {
        level++;
        totalXp += xpForNextLevel;
        if (totalXp > xp) {
            break;
        }
        xpForNextLevel += Math.floor((levelOffset + level) * levelMultiplier);
    }

    if (level >= maxLevel) {
        xpForNextLevel = 0;
    }

    let currentLevelXp = totalXp - xpForNextLevel;
    let nextLevelXp = totalXp;
    let progress = (xp - currentLevelXp) / (nextLevelXp - currentLevelXp);
    let remainingXp = nextLevelXp - xp;

    return {
        level,
        currentLevelXp,
        remainingXp,
        nextLevelXp,
        progress,
    };
}

async function calculateShrineLevel(xp) {
    let level = 1;
    if (xp >= 100000) { // 10000 / 5 = 2000 blessings
        level = 6;
    } else if (xp >= 5000) { // 5000 / 5 = 1000 blessings
        level = 5;
    } else if (xp >= 2500) { // 2500 / 5 = 500 blessings
        level = 4;
    } else if (xp >= 1000) { // 1000 / 5 = 200 blessings
        level = 3;
    } else if (xp >= 500) { // 500 / 5 = 100 blessings
        level = 2;
    }
    return level;
}

async function giveXP(profile, guild, xp, client, source) {
    let logger = await getLogger();
    const now = DateTime.now().setZone('America/New_York');
    const preLevel = profile.level;

    const xpBooster = profile.booster.xp || 1.0;
    xp = Math.floor(xp * xpBooster);

    profile.xp += xp;
    profile.lastXpTime = now.toJSDate();

    const postLevelInfo = await calculateLevel(profile.xp);
    const postLevel = postLevelInfo.level;

    profile.level = postLevel;
    await profile.save();
    logger.debug(`${profile.username} earned ${xp} XP with ${xpBooster}x booster from ${source}`);
    //log.info(`Level: ${preLevel} => ${postLevel}`);
    if (postLevel > preLevel) {
        logger.debug(`${profile.username} leveled up to ${postLevel}!!`);
        const settings = await GuildSettings.findOne({ guildId: guild }).lean();
        if (settings.levelupMessages && settings.levelupChannel !== '0' && settings.levelupChannel && client) {
            try {
                const channel = client.channels.cache.get(settings.levelupChannel);
                if (channel) {
                    await channel.send(`:tada: ${profile.username} leveled up to ${postLevel}!!`);
                } else {
                    logger.warn('Channel not found in guild');
                }
            } catch (error) {
                logger.error(profile.userId+' | giveXP: '+error);
            }
        }        
        return true;
    };
}

async function giveCoins(profile, coins, source) {
    let logger = await getLogger();
    const coinsBooster = profile.booster.coins || 1.0;
    coins = Math.floor(coins * coinsBooster);
    profile.coins += coins;
    await profile.save();

    logger.debug(`${profile.username} earned ${coins} coins with ${coinsBooster}x booster from ${source}`);
}

async function giveItem(profile, item, quantity, source) {
    let logger = await getLogger();
    const itemData = await Item.findOne({ itemId: item }).lean();
    if (!itemData) return;

    if (itemData.itemId === 'junkyard_pass') {
        profile.junkyardPasses += quantity;
    } else if (itemData.itemId === 'lottery_ticket') {
        profile.luckyTokens += quantity;
    } else if (itemData.itemId === 'booster_xp') {
        profile.booster.xp = 2.0;
        profile.booster.xpExpires = DateTime.now().plus({ hours: 1 }).toJSDate();
    } else if (itemData.itemId === 'booster_coins') {
        profile.booster.coins = 2.0;
        profile.booster.coinsExpires = DateTime.now().plus({ hours: 1 }).toJSDate();
    } else {
        return false;
    }

    logger.debug(`${profile.username} earned ${quantity} ${itemData.name} from ${source}`);
    await profile.save();
}


// Reward functions
const rewardsTable = async (profile) => {
    let logger = await getLogger();
    try {
        const levelInfo = await calculateLevel(profile.xp);
        await updateBooster(profile);
        const prof = await Profile.findOne({ userId: profile.userId }).lean();

        const minXp = levelInfo.level * 2;
        const maxXp = levelInfo.level * 10;
        const xpBooster = prof.booster.xp || 1.0;
        const chatXP = Math.floor(Math.random() * (maxXp - minXp + 1) + minXp) * xpBooster;
        const workXP = Math.floor(Math.random() * (125 - 75 + 1) + 75) * xpBooster;
        const dailyCoins = levelInfo.level * 100;
        const weeklyCoins = levelInfo.level * 500;
        //logger.debug(`chatXP: ${chatXP}, workXP: ${workXP}, dailyCoins: ${dailyCoins}, weeklyCoins: ${weeklyCoins}`);
        if (isNaN(dailyCoins)) {
            logger.warn('Daily coins calculation resulted in NaN');
            throw new Error('Invalid daily coins calculation');
        }
        return { chatXP, workXP, dailyCoins, weeklyCoins };
    } catch (err) {
        logger.error(profile.userId+' | rewardsTable: '+err);
        throw err;
    }   
}

const calculatePassiveIncome = async (profile) => {
    let logger = await getLogger();
    await updateBooster(profile);
    profile = await Profile.findOne({ userId: profile.userId }).lean();
    const xpBooster = profile.booster.xp || 1.0;
    const moneyBooster = profile.booster.coins || 1.0;
    const now = DateTime.now().setZone('America/New_York');
    const jobData = await Job.findById(profile.job).lean();
    const employee = jobData ? jobData.employees.find(e => e.userID === profile.userId) : null;
    const jobPay = employee ? employee.coinsPerMin : 0;

    const xpIncome = (profile.level * 2) * xpBooster;
    const moneyIncome = ((profile.level * 100) + jobPay) * moneyBooster;
    //logger.debug(`Passive income for [L${profile.level}] ${profile.username}: ${xpIncome} XP/hr, ${moneyIncome} coins/hr`);
    return { xpIncome, moneyIncome };
}

// Update boosters
const updateBooster = async (profile) => {
    let logger = await getLogger();
    const booster = profile.booster;
    const now = DateTime.now().setZone('America/New_York');

    try {
        if (booster.xp && DateTime.fromJSDate(booster.xpExpires) < now) {
            booster.xp = 1.0;
            booster.xpExpires = null;
        }

        if (booster.coins && DateTime.fromJSDate(booster.coinsExpires) < now) {
            booster.coins = 1.0;
            booster.coinsExpires = null;        
        }
        await profile.save();
    } catch (err) {
        logger.error(profile.userId+' | updateBooster: '+err);
    }
};

const resetLuckyTokens = async (profile) => {
    let logger = await getLogger();
    const prof = await Profile.findOne({ userId: profile.userId });

    const lastLotteryPlay = prof.lastLotteryPlay ? DateTime.fromJSDate(prof.lastLotteryPlay) : null;
    const now = DateTime.now().setZone('America/New_York');
    const nextLotteryPlay = lastLotteryPlay ? lastLotteryPlay.plus({ days: 1 }).startOf('day') : now;

    if (now >= nextLotteryPlay) {
        try {
            prof.luckyTokens = 5;
            prof.lastLotteryPlay = now.toJSDate();
            await prof.save();
        } catch (err) {
            logger.error(profile.userId+' | resetLuckyTokens: '+err);
        }
    }
    return prof;
}

const calculatePlayerScore = async (profile) => {
    const vehicleStats = await generateVehiclestats(profile, profile.vehicles.find(v => v.isActive));
    let playerScore = Math.floor(vehicleStats.playerPower);

    //console.log(`Player Score: ${playerScore} | ${vehicleStats.playerPower} | ${vehicleStats.totalPower}`);

    return playerScore;
}

// Challenges
async function updateChallenge(user, type) {
    let logger = await getLogger();
    const now = DateTime.now().setZone('America/New_York');
    const profile = await Profile.findOne({ userId: user.userId });

    if (!profile) {
        logger.error(user.id + ' | updateChallenges: Profile not found');
        return;
    }

    // Fetch all challenges that match the targetType and are appropriate for the category.
    const challenges = await Challenge.find({ targetType: type });

    if (!challenges.length) return;

    try {
        // Loop through each challenge and update accordingly
        challenges.forEach(async (challengeData) => {
            const challengeProgress = profile.challenges.find(ch => ch.challengeId.equals(challengeData._id));

            if (!challengeProgress) {
                if (challengeData.targetCount === 1) {
                    profile.challenges.push({
                        challengeId: challengeData._id,
                        progress: 1,
                        completed: true,
                        lastCompleted: now.toJSDate()
                    });
                } else {
                    profile.challenges.push({
                        challengeId: challengeData._id,
                        progress: 1
                    });
                }
            } else if (challengeProgress && challengeProgress.completed) {
                return;
            } else {
                challengeProgress.progress++;
                if (challengeProgress.progress >= challengeData.targetCount) {
                    challengeProgress.completed = true;
                    challengeProgress.lastCompleted = now.toJSDate();
                }
            }
        });

        await profile.save();
    } catch (err) {
        logger.error(user.id + ' | updateChallenges: ' + err);
    }
}


// Vehicle upgrades
const calculateStatBonuses = async (vehicle) => {

    if (!vehicle.upgrades || vehicle.upgrades.length === 0) return { speedBonus: 0, accelerationBonus: 0, gripBonus: 0, suspensionBonus: 0, brakesBonus: 0, torqueBonus: 0, horsepowerBonus: 0, aeroBonus: 0 };
    return vehicle.upgrades.reduce((acc, upgrade) => {
        acc.speedBonus += upgrade.stats.speed || 0;
        acc.accelerationBonus += upgrade.stats.acceleration || 0;
        acc.gripBonus += upgrade.stats.grip || 0;
        acc.suspensionBonus += upgrade.stats.suspension || 0;
        acc.brakesBonus += upgrade.stats.brakes || 0;
        acc.torqueBonus += upgrade.stats.torque || 0;
        acc.horsepowerBonus += upgrade.stats.horsepower || 0;
        acc.aeroBonus += upgrade.stats.aerodynamics || 0;
        return acc;
    }, { speedBonus: 0, accelerationBonus: 0, gripBonus: 0, suspensionBonus: 0, brakesBonus: 0, torqueBonus: 0, horsepowerBonus: 0, aeroBonus: 0 });
}

const generateVehiclestats = async (profile, vehicle) => {
    let logger = await getLogger();
    if (!vehicle) return null;
    const upgradeBonuses = await calculateStatBonuses(vehicle);

    const speedUpgrade = upgradeBonuses.speedBonus;
    const accelUpgrade = upgradeBonuses.accelerationBonus;
    const gripUpgrade = upgradeBonuses.gripBonus;
    const suspensionUpgrade = upgradeBonuses.suspensionBonus;
    const brakesUpgrade = upgradeBonuses.brakesBonus;
    const torqueUpgrade = upgradeBonuses.torqueBonus;
    const horsepowerUpgrade = upgradeBonuses.horsepowerBonus;
    const aeroUpgrade = upgradeBonuses.aeroBonus;
    
    const speedBonus = profile.stats.speed;
    const accelBonus = profile.stats.acceleration;
    const gripBonus = profile.stats.grip;
    const suspensionBonus = profile.stats.suspension;
    const brakesBonus = profile.stats.brakes;
    const torqueBonus = profile.stats.torque;
    const horsepowerBonus = profile.stats.horsepower;
    const aeroBonus = profile.stats.aerodynamics;
    
    const speed = vehicle.stats.speed + speedBonus + speedUpgrade;
    const acceleration = vehicle.stats.acceleration + accelBonus + accelUpgrade;
    const grip = vehicle.stats.grip + gripBonus + gripUpgrade;
    const suspension = vehicle.stats.suspension + suspensionBonus + suspensionUpgrade;
    const brakes = vehicle.stats.brakes + brakesBonus + brakesUpgrade;
    const torque = vehicle.stats.torque + torqueBonus;
    const horsepower = vehicle.stats.horsepower + horsepowerBonus;
    const aero = vehicle.stats.aerodynamics + aeroBonus;

    const totalPower = (speed + acceleration + grip + suspension + brakes + aero + torque + horsepower);
    const playerPower = totalPower + profile.level;

    //logger.debug(`generateVehiclestats: ${vehicle.year} ${vehicle.make} ${vehicle.model} | Total Power: ${totalPower} | Speed: ${speed} | Accel: ${acceleration} | Grip: ${grip} | Suspension: ${suspension} | Brakes: ${brakes} | Torque: ${torque} | Horsepower: ${horsepower} | Aero: ${aero} | Player Power: ${playerPower}`);

    return {
        totalPower,
        speed,
        acceleration,
        grip,
        suspension,
        brakes,
        torque,
        horsepower,
        aero,
        speedBonus,
        accelBonus,
        gripBonus,
        suspensionBonus,
        brakesBonus,
        torqueBonus,
        horsepowerBonus,
        aeroBonus,
        speedUpgrade,
        accelUpgrade,
        gripUpgrade,
        suspensionUpgrade,
        brakesUpgrade,
        torqueUpgrade,
        horsepowerUpgrade,
        aeroUpgrade,
        playerPower
    };
}

async function generateStatsText(vehicleStats) {
    // Format the stats text for the vehicle, upgrades and bonuses rounded to 2nd decimal place
    const speedText = `Speed: ${vehicleStats.speed.toFixed(1)} (+${(vehicleStats.speedBonus + vehicleStats.speedUpgrade).toFixed(1)})`;
    const accelText = `Acceleration: ${vehicleStats.acceleration.toFixed(1)} (+${(vehicleStats.accelBonus + vehicleStats.accelUpgrade).toFixed(1)})`;
    const gripText = `Grip: ${vehicleStats.grip.toFixed(1)} (+${(vehicleStats.gripBonus + vehicleStats.gripUpgrade).toFixed(1)})`;
    const suspensionText = `Suspension: ${vehicleStats.suspension.toFixed(1)} (+${(vehicleStats.suspensionBonus + vehicleStats.suspensionUpgrade).toFixed(1)})`;
    const brakesText = `Brakes: ${vehicleStats.brakes.toFixed(1)} (+${(vehicleStats.brakesBonus + vehicleStats.brakesUpgrade).toFixed(1)})`;
    const torqueText = `Torque: ${vehicleStats.torque.toFixed(1)} (+${vehicleStats.torqueBonus.toFixed(1)})`;
    const horsepowerText = `Horsepower: ${vehicleStats.horsepower.toFixed(1)} (+${vehicleStats.horsepowerBonus.toFixed(1)})`;
    const aeroText = `Aerodynamics: ${vehicleStats.aero.toFixed(1)} (+${vehicleStats.aeroBonus.toFixed(1)})`;

    return { speedText, accelText, gripText, suspensionText, brakesText, torqueText, horsepowerText, aeroText };
}

// partBonuses
// "Turbo", "Supercharger", "Coilovers", "Suspension", "Exhaust", "Intake", "Intercooler", "Wheels", "Tires", "Brakes", "Nitrous", "Weight Reduction", "Aero", "Engine", "Transmission"
const partBonuses = {
    turbo: {
        speed: 0.4,
        acceleration: 0.5,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    supercharger: {
        speed: 0.7,
        acceleration: 0.3,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    wheels: {
        speed: 0.1,
        acceleration: 0.0,
        grip: 0.6,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    tires: {
        speed: 0.0,
        acceleration: 0.1,
        grip: 0.8,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    brakes: {
        speed: 0.0,
        acceleration: 0.0,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.9,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    suspension: {
        speed: 0.0,
        acceleration: 0.1,
        grip: 0.0,
        suspension: 0.8,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    exhaust: {
        speed: 0.2,
        acceleration: 0.1,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    intake: {
        speed: 0.1,
        acceleration: 0.2,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    intercooler: {
        speed: 0.1,
        acceleration: 0.0,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    coilovers: {
        speed: 0.0,
        acceleration: 0.3,
        grip: 0.0,
        suspension: 0.7,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    nitrous: {
        speed: 0.5,
        acceleration: 0.5,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.0
    },
    weightReduction: {
        speed: 0.2,
        acceleration: 0.3,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 0.2
    },
    aero: {
        speed: 0.0,
        acceleration: 0.0,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.0,
        aero: 1.0
    },
    engine: {
        speed: 0.0,
        acceleration: 0.0,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.5,
        horsepower: 0.5,
        aero: 0.0
    },
    transmission: {
        speed: 0.0,
        acceleration: 0.5,
        grip: 0.0,
        suspension: 0.0,
        brakes: 0.0,
        torque: 0.0,
        horsepower: 0.5,
        aero: 0.0
    }
}

// Update player stats based on active blessings
async function updateStats(profile) {
    let logger = await getLogger();
    const activeBlessings = profile.blessings.filter(b => b.active);
    if (!activeBlessings.length) return;
    const initialStats = {
        speed: 0,
        acceleration: 0,
        handling: 0,
        luck: 0,
        fuelEfficiency: 0
    };

    const activeBlessingStats = activeBlessings.reduce((acc, blessing) => {
        Object.keys(initialStats).forEach(stat => {
            if (blessing.stats[stat]) {
                acc[stat] += blessing.stats[stat];
            }
        });
        return acc;
    }, initialStats);

    console.log(`Stat Updates - Speed: ${activeBlessingStats.speed} | Accel: ${activeBlessingStats.acceleration} | Handling: ${activeBlessingStats.handling} | Luck: ${activeBlessingStats.luck} | Fuel: ${activeBlessingStats.fuelEfficiency}`);
    profile.stats = { ...profile.stats, ...activeBlessingStats };  // Update the stats by merging with existing ones

    await profile.save();
}


// Item functions

async function getItemDetails(item, quantity) {
    let logger = await getLogger();
    const itemData = await Item.findOne({ itemId: item }).lean();
    if (!itemData) return null;


    if (isNaN(itemData.value) || typeof itemData.value !== 'number') {
        logger.error(`Invalid item value for ${item}: ${itemData.value}`);
        return null;
    }

    return {
        itemId: itemData.itemId,
        name: itemData.name,
        totalCost: itemData.value * (quantity || 1),
        currency: itemData.currency, // 'coins' or 'CrewTokens'
        type: itemData.type,
        enabled: itemData.enabled
    };
}

async function itemPurchase(profile, item, quantity) {
    let logger = await getLogger();
    const itemData = await Item.findOne({ itemId: item }).lean();
    if (!itemData) return;

    if (profile.coins < itemData.value * quantity) {
        return false;
    }
    if (itemData.itemId === 'junkyard_pass') {
        profile.junkyardPasses += quantity;
    } else if (itemData.itemId === 'lottery_ticket') {
        profile.luckyTokens += quantity;
    } else if (itemData.itemId === 'booster_xp') {
        profile.booster.xp = 2.0;
        profile.booster.xpExpires = DateTime.now().plus({ hours: 1 }).toJSDate();
    } else if (itemData.itemId === 'booster_coins') {
        profile.booster.coins = 2.0;
        profile.booster.coinsExpires = DateTime.now().plus({ hours: 1 }).toJSDate();
    } else {
        return false;
    }

    logger.debug(`Player ${profile.username} ${profile.coins} purchased ${quantity} ${itemData.name} for ${itemData.value * quantity} ${itemData.currency}`);

    if (itemData.currency === 'CrewTokens') {
        profile.crewTokens -= itemData.value * quantity;
    } else {
        profile.coins -= itemData.value * quantity;
    }

    await profile.save();

    const purch = {
        userId: profile.userId,
        purchaseDate: DateTime.now().setZone('America/New_York').toJSDate(),
        quantity: quantity,
        price: itemData.value * quantity,
        currency: itemData.currency
    };

    itemData.purchases.push(purch);
    await itemData.save();
}



module.exports = {
    // Level related functions
    calculateLevel,
    calculateShrineLevel,
    giveXP,
    giveCoins,
    giveItem,
    calculatePlayerScore,
    // Reward functions
    rewardsTable,
    resetLuckyTokens,
    calculatePassiveIncome,
    updateBooster,
    updateChallenge,
    // Vehicle upgrades
    calculateStatBonuses,
    partBonuses,
    generateVehiclestats,
    generateStatsText,
    updateStats,
    // Item functions
    getItemDetails,
    itemPurchase
};