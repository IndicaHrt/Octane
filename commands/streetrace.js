const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ActionRowBuilder } = require('discord.js');
const { Profile, Vehicle } = require('../models');
const { DateTime } = require('luxon');
const { giveXP, giveCoins, giveItem, updateChallenge, generateVehiclestats } = require('../utils/main');
const { getLogger } = require('../utils/logging');
const { updateBooster } = require('../utils/main');
const sharp = require('sharp');

const baseValue = { "Turbo": 800, "Supercharger": 600, "Suspension": 450, "Coilovers": 300, "Exhaust": 300, "Intake": 150, "Intercooler": 400, "Wheels": 200, "Tires": 150, "Brakes": 150, "Nitrous": 500, "Weight Reduction": 200, "Aero": 300, "Engine": 1000, "Transmission": 500 };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('race')
        .setDescription('Challenge an AI in a street race. Win to earn rewards.'),
    async execute(interaction) {
        let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        if (!profile || !profile.vehicles.some(v => v.isActive)) {
            return interaction.reply({ content: 'No active vehicle found.', ephemeral: true });
        }

        const playerVehicle = profile.vehicles.find(v => v.isActive);
        const level = profile.streetRaceStats.highestLevelUnlocked;
        const aiVehicleCurrent = await generateOpponent(profile, level);
        const aiVehicleNext = await generateOpponent(profile, level + 1);
        if (!aiVehicleCurrent || !aiVehicleNext) {
            return interaction.reply({ content: 'No AI vehicles found.', ephemeral: true });
        }

        let e = await buildRaceStartEmbed(profile, playerVehicle, aiVehicleCurrent, aiVehicleNext);
        const message = await interaction.reply({ embeds: [e.embed], components: [e.row], files: [e.attachment] });
        const filter = i => i.user.id === interaction.user.id && (i.customId === 'race_current_level' || i.customId === 'race_next_level');
        const collector = message.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            if (!['race_current_level', 'race_next_level'].includes(i.customId)) return;
            await i.deferUpdate().catch(console.error);

            const isNextLevel = i.customId === 'race_next_level';
            const aiVehicle = isNextLevel ? aiVehicleNext : aiVehicleCurrent;
            const aiLevel = isNextLevel ? level + 1 : level;
            try {
                const result = await simulateRace(profile, aiVehicle, aiLevel);

                let rewardsMessage = 'Well, you didn\'t lose your car at least.';
                const rewards = await calculateRewards(profile, result, aiLevel, isNextLevel, interaction, playerVehicle);
                if (result) {
                    rewardsMessage = `${rewards.coinsEarned} <:coins:1269411594685644800>\n\n${rewards.xpEarned} XP${rewards.bonusMessage}`;
                }
                e = await buildRaceEmbed(profile, playerVehicle, result, rewardsMessage);

                setTimeout(async () => {
                    await i.editReply({ embeds: [e.embed], components: [e.row], files: [] });
                }, 1000);
                collector.stop();
            } catch (error) {
                logger.error(interaction.user.tag+' | race: '+error);
                await i.editReply('An error occurred during the race.');
            }
        });
    }
};

async function buildRaceStartEmbed(profile, playerVehicle, aiVehicleCurrent, aiVehicleNext) {
    const resizedBuffer = await sharp(playerVehicle.image)
            .resize(180, 180)
            .toBuffer();
    const attachment = new AttachmentBuilder(resizedBuffer, { name: 'vehicle.png' });

    const currentLevel = profile.streetRaceStats.highestLevelUnlocked;
    const nextLevel = currentLevel + 1;

    const embed = new EmbedBuilder()
        .setTitle('Street Race Challenge')
        .setDescription('Choose your race level. Racing will consume 25% of fuel\nYou can use `/refuel` to get more')
        .addFields(
            { name: 'Current Level - ' + currentLevel, value: `${aiVehicleCurrent.make} ${aiVehicleCurrent.model}`, inline: true },
            { name: 'Next Level - ' + nextLevel, value: `${aiVehicleNext.make} ${aiVehicleNext.model}`, inline: true },
            { name: 'Your Vehicle', value: `${playerVehicle.make} ${playerVehicle.model}`, inline: false }
        )
        .setImage('attachment://vehicle.png')
        .setFooter({ text: `${playerVehicle.stats.currentFuel}% of fuel remaining.` });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('race_current_level')
                .setLabel('Race Current Level')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('race_next_level')
                .setLabel('Race Next Level')
                .setStyle(ButtonStyle.Success),
    );

    return { embed, row, attachment };
}

async function buildRaceEmbed(profile, playerVehicle, result, rewardsMessage) {
    const embed = new EmbedBuilder()
        .setTitle(':checkered_flag: Race Result: ' + (result ? '🏆 You won the race!' : '😞 You lost the race.'))
        .setDescription(`Rewards: ${rewardsMessage}`)
        .addFields(
            { name: 'Race Stats', value: `${profile.streetRaceStats.wins}W / ${profile.streetRaceStats.losses}L` }
        )
        //.setColor(result ? '#00FF00' : '#FF0000')
        .setFooter({ text: `Race consumed 25% of fuel, ${playerVehicle.stats.currentFuel.toLocaleString()}% remaining.` });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('race_menu')
                .setLabel('Race Again')
                .setStyle(ButtonStyle.Primary)
    );

    return { embed, row };
}

const generateOpponent = async (profile, aiLevel) => {
    let logger = await getLogger();
    const vehicles = await Vehicle.find({ isActive: true, id: { $lte: aiLevel } });
    if (vehicles.length === 0) {
        await logger.warn(`race: ${profile.username} No AI vehicles`);
        return null;
    }
    let aiBonus = 0;
    let aiVehicle;
    if (aiLevel % 10 === 0) {
        aiVehicle = vehicles[vehicles.length - 1];
        aiBonus = aiLevel * 0.2;
        aiVehicle.stats.horsepower += aiBonus;
        aiVehicle.stats.torque += aiBonus;
        aiVehicle.stats.speed += aiBonus;
        aiVehicle.make = '**Legends**';
    } else {
        aiVehicle = vehicles[Math.floor(Math.random() * vehicles.length)];
    }
    
    return aiVehicle;
}

async function simulateRace(profile, opponent, aiLevel) {
    let logger = await getLogger();
    const vehicleStats = await generateVehiclestats(profile, profile.vehicles.find(v => v.isActive));
    if (!opponent || !vehicleStats) {
        return false;
    }
    const aiVehicleStats = opponent.stats;
    const aiTotal = (aiVehicleStats.speed + aiVehicleStats.acceleration + aiVehicleStats.grip + aiVehicleStats.suspension + aiVehicleStats.brakes + aiVehicleStats.horsepower + aiVehicleStats.torque + aiVehicleStats.aerodynamics) + aiLevel;
    const playerTotal = vehicleStats.playerPower;

    const result = playerTotal > aiTotal;

    logger.debug(`simulateRace: ${profile.username} | Player: ${playerTotal} | Opponent: ${aiTotal} | Result: ${result}`);
    return result;   
}

async function calculateRewards(profile, result, aiLevel, isNextLevel, i, playerVehicle) {
    let logger = await getLogger();
    await updateBooster(profile);
    let fuelCost = 25;
    let bonusMessage = '!';
    let coinsEarned = 0;
    let xpEarned = 0;
    let aiBonus = 1;
    const xpBooster = profile.booster.xp || 1.0;
    const coinsBooster = profile.booster.coins || 1.0;
    const firstBossWin = aiLevel != profile.streetRaceStats.highestBossWin;
    if (result) {
        if (aiLevel % 10 === 0) {
            aiBonus = aiLevel * 0.2; // 3 
        }
        console.log(`AI Bonus: ${aiBonus}`);
        const minCoins = aiBonus * 200;
        const maxCoins = aiBonus * 350;
        coinsEarned = Math.floor((Math.random() * (maxCoins - minCoins + 1) + minCoins) * coinsBooster);
        xpEarned = Math.floor(((Math.random() * (200 - 100 + 1) + 100) * xpBooster) * aiBonus);
    
        //logger.debug(`Player: ${profile.userId}, minCoins: ${minCoins}, maxCoins: ${maxCoins}, coinsEarned: ${coinsEarned}, xpEarned: ${xpEarned} for AI level ${aiLevel}`);
        await giveCoins(profile, coinsEarned, 'Race rewards');
        await giveXP(profile, i.guildId, xpEarned, i.client, 'Race rewards');
        if (Math.random() < 0.3) {
            await giveItem(profile, 'junkyard_pass', 1, 'Rare Race Reward');
            bonusMessage = '\nYou found a Junkyard Pass!';
        }
        profile.streetRaceCount += 1;
        profile.streetRaceStats.wins += 1;
        profile.streetRaceStats.lastRaceDate = DateTime.now().setZone('America/New_York').toJSDate();
        playerVehicle.stats.currentFuel -= fuelCost;
        if (isNextLevel) {
            profile.streetRaceStats.highestLevelUnlocked++;
        }
        console.log(`First Boss Win: ${firstBossWin} | AI Level: ${aiLevel} | Highest Boss Win: ${profile.streetRaceStats.highestBossWin}`);
        if (aiLevel % 10 === 0 && firstBossWin) {
            const item = Object.keys(baseValue)[Math.floor(Math.random() * Object.keys(baseValue).length)];
            profile.inventory.push({ name: item, condition: 'Usable', value: baseValue[item], category: 'Part' });
            bonusMessage += `\nYou won a ${item} from the Boss Race!`;
            profile.streetRaceStats.highestBossWin = aiLevel;
        }
        await profile.save();
        await updateChallenge(profile, 'racesCompleted');
    } else {
        profile.streetRaceCount += 1;
        profile.streetRaceStats.losses += 1;
        //playerVehicle.stats.currentFuel -= fuelCost;
        profile.streetRaceStats.lastRaceDate = DateTime.now().setZone('America/New_York').toJSDate();
        await profile.save();
    }
    return { xpEarned, coinsEarned, bonusMessage };
}