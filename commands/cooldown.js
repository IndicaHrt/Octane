const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { resetLuckyTokens } = require('../utils/main');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cooldowns')
        .setDescription('Check and refresh the cooldowns for your next daily and weekly rewards.'),
    category: 'General',
    async execute(interaction, guildSettings, client) {
        let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });

        if (!profile) {
            return interaction.reply({ content: 'You do not have a profile yet.', ephemeral: true });
        }

        try {
            const now = DateTime.now().setZone('America/New_York');
            await resetLuckyTokens(profile);
            const embed = await buildCooldownEmbed(profile, now);

            const rows = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('execute_afk')
                    .setLabel('AFK')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('execute_daily')
                    .setLabel('Daily')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('execute_weekly')
                    .setLabel('Weekly')
                    .setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('execute_work')
                    .setLabel('Work')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('race_menu')
                    .setLabel('Race')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('execute_refuel')
                    .setLabel('Refuel')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('execute_lottery')
                    .setLabel('Lottery')
                    .setStyle(ButtonStyle.Primary)
            )];

            const message = await interaction.reply({
                embeds: [embed],
                components: rows,
                fetchReply: true,
            });
        } catch (error) {
            logger.error(interaction.user.tag + ' | cooldowns: ' + error);
            return interaction.reply({ content: 'An error occurred while checking cooldowns.', ephemeral: true });
        }
    }
};

async function buildCooldownEmbed(profile, now) {
    const logger = await getLogger();
    let lastDaily = profile.lastDaily ? DateTime.fromJSDate(profile.lastDaily) : now.minus({ days: 1 });
    let lastWeekly = profile.lastWeekly ? DateTime.fromJSDate(profile.lastWeekly) : now.minus({ weeks: 1 });
    
    let nextDailyReset = lastDaily.plus({ days: 1 }).startOf('day');
    let nextWeeklyReset = lastWeekly.plus({ weeks: 1 }).startOf('week');

    const dailyResetString = now >= nextDailyReset ? ':white_check_mark:' : ':no_entry: '+nextDailyReset.diff(now).toFormat("hh 'hours', mm 'minutes'");
    const weeklyResetString = now >= nextWeeklyReset ? ':white_check_mark:' : ':no_entry: '+nextWeeklyReset.diff(now).toFormat("dd 'days', hh 'hours'");
    

    const workCooldown = profile.lastWorkTime && now.diff(DateTime.fromJSDate(profile.lastWorkTime)).as('milliseconds') < 1200000
        ? `:no_entry: ${Math.round((1200000 - now.diff(DateTime.fromJSDate(profile.lastWorkTime)).as('milliseconds')) / 60000)} minutes` 
        : ':white_check_mark:';
    

    const playerVehicle = profile.vehicles.find(v => v.isActive);
    let fuelCost = 25;
    let raceCooldown;
    if (playerVehicle.stats.currentFuel < fuelCost) {
        raceCooldown = ':no_entry: No fuel, use `/refuel` to top up.';
    } else {
        raceCooldown = `:white_check_mark: ${playerVehicle.stats.currentFuel}% Fuel`;
    }

    const lotteryCooldown = profile.luckyTokens && profile.luckyTokens > 0 ? `:white_check_mark: ${profile.luckyTokens} Lucky Tokens` : ':no_entry: '+nextDailyReset.diff(now).toFormat("hh 'hours', mm 'minutes'");

    const afkCooldown = profile.lastAFKClaim && now.diff(DateTime.fromJSDate(profile.lastAFKClaim)).as('milliseconds') < 300000  // 5 minutes in ms = 300000
        ? `:no_entry: ${Math.round((300000 - now.diff(DateTime.fromJSDate(profile.lastAFKClaim)).as('milliseconds')) / 60000)} minutes` 
        : ':white_check_mark:';

    const timeRemaining = 30 - DateTime.now().diff(DateTime.fromJSDate(profile.lastRefuel)).as('minutes');
    const readyToRefuel = profile.lastRefuel && DateTime.now().diff(DateTime.fromJSDate(profile.lastRefuel)).as('minutes') < 30
        ? `:no_entry: ${Math.ceil(timeRemaining).toLocaleString()} minutes`
        : ':white_check_mark:';

    try {
        // Initialize supply runs if they are not already
        if (!profile.supplyRuns || profile.supplyRuns.length === 0) {
            profile.supplyRuns = [{
                startTime: now,
                endTime: now,
                couponType: null,
                state: 'Available'
            }, {
                startTime: now,
                endTime: now,
                couponType: null,
                state: 'Available'
            }, {
                startTime: now,
                endTime: now,
                couponType: null,
                state: 'Available'
            }];
            await profile.save();
        }
    } catch (error) {
        logger.error('Error initializing supply runs for ' + profile.userId + ': ' + error);
    }

    let supplyRunCooldown = '';
    let runNumber = 1;
    const supplyRuns = profile.supplyRuns;
    supplyRuns.forEach(async (run) => {
        if (run.state === 'Ready to Collect') {
            supplyRunCooldown += `:white_check_mark: [${runNumber}] Ready to Collect\n`;
        } else if (run.state === 'In Progress' && DateTime.fromJSDate(run.endTime) > now) {
            supplyRunCooldown += `:no_entry: [${runNumber}] ${DateTime.fromJSDate(run.endTime).diff(now).toFormat("hh 'hours', mm 'minutes")} remaining\n`;
        } else {
            supplyRunCooldown += `:white_check_mark: [${runNumber}] Available\n`;
        }
        runNumber++;
    });

    return new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`Your Cooldowns`)
        .setDescription(`**AFK Rewards**\n${afkCooldown}\n\n**Daily**\n${dailyResetString}\n\n**Weekly**\n${weeklyResetString}`)
        .addFields(
            { name: '\u200B', value: '\u200B' },
            { name: 'Work', value: `${workCooldown}`, inline: false },
            { name: 'Race', value: `${raceCooldown}`, inline: false },
            { name: 'Refuel', value: `${readyToRefuel}`, inline: false },
            { name: 'Lottery', value: `${lotteryCooldown}`, inline: false },
            { name: 'Supply Runs', value: `${supplyRunCooldown}`, inline: false }
        )
        .setFooter({ text: `Refreshed ${now.toLocaleString(DateTime.DATETIME_MED)}` });
}
