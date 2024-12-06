const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { giveXP, giveCoins, updateChallenge, rewardsTable } = require('../utils/main');
const { DateTime } = require('luxon');
const { getLogger } = require('../utils/logging');
const { Profile, Job } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Work a job to earn coins for car parts, upgrades, and new cars! You also earn XP towards promotions.'),
    category: 'Rewards',
    async execute(interaction, guildSettings, client) {
        const profile = await Profile.findOne({ userId: interaction.user.id });
        const now = DateTime.now().setZone('America/New_York');
        const logger = await getLogger();

        if (!profile || !profile.job) {
            await interaction.reply({ content: "You do not have a job. Use /job list to find jobs.", ephemeral: true });
            return;
        }
    
        const job = await Job.findById(profile.job);
        if (!job) {
            await interaction.reply({ content: "Job not found. It might have been removed.", ephemeral: true });
            return;
        }

        const employeeInfo = job.employees.find(e => e.userID === interaction.user.id);
        if (!employeeInfo) {
            await interaction.reply({ content: "You are not an employee of this job.", ephemeral: true });
            return;
        }

        if (profile.lastWorkTime) {
            const lastWorkedTime = DateTime.fromJSDate(profile.lastWorkTime);
            const diff = now.diff(lastWorkedTime, 'minutes').minutes;
            if (diff < 20) {
                return interaction.reply('You are still tired from your last job. Please wait a bit.');
            }
        }

        try {
            const jobData = await Job.findById(profile.job).populate('positions');
            const positionData = jobData.positions.find(p => p._id.toString() === employeeInfo.positionId.toString());
            const rewardDetails = await calculateWorkReward(profile, jobData, positionData);
            //logger.debug(`Coins earned: ${rewardDetails.coinsEarned}, XP earned: ${rewardDetails.xpEarned}`);

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(job.emoji + ' Work  at ' + job.name + ' as ' + positionData.name)
                .setDescription(`**Job Details**\nEarn between ${rewardDetails.minCoins} and ${rewardDetails.maxCoins} <:coins:1269411594685644800>\nYour current job takes 10 seconds to complete.`)
                .setFooter({ text: 'Earning potential increases based on your position.' });

            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('startWork')
                        .setLabel('Working...')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true)
                );

            const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

            setTimeout(async () => {
                const updatedRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('completeWork')
                            .setLabel('Collect Earnings')
                            .setStyle(ButtonStyle.Success)
                    );

                await interaction.editReply({ components: [updatedRow] });
            }, 10000);

            const filter = i => i.customId === 'completeWork' && i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 25000 });
            
            collector.on('collect', async i => {
                if (i.customId === 'completeWork') {
                    //await giveXP(profile, interaction.guildId, rewardDetails.xpEarned, client, 'Work rewards');
                    await giveCoins(profile, rewardDetails.coinsEarned, 'Work rewards');
                    profile.lastWorkTime = now.toJSDate();
                    profile.workCount += 1;
                    await profile.save();
                    employeeInfo.lastWorked = now.toJSDate();
                    employeeInfo.coinsEarned += rewardDetails.coinsEarned;
                    employeeInfo.xp += rewardDetails.xpEarned;
                    await job.save();
                    await updateChallenge(profile, 'workCompleted');

                    const comp = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('end')
                            .setLabel('Waiting for next job')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(true)
                    );

                    const embed = new EmbedBuilder()
                        .setTitle(':hourglass: Work Complete :hourglass: ')
                        .setDescription(`You earned ${rewardDetails.coinsEarned} <:coins:1269411594685644800> and ${rewardDetails.xpEarned} Job XP!`)
                        .setColor('#FFFF00')
                        .setFooter({ text: `Return in 20 minutes for your next job.` });
                    try {
                        await i.update({ embeds: [embed], components: [] });
                    } catch (error) {
                        logger.error(interaction.user.tag+' | work_payout: '+error);
                    }
                    collector.stop();
                }
            });
        } catch (error) {
            logger.error(interaction.user.tag+' | work_calculate: '+error);
        }
    }
};

const calculateWorkReward = async (profile, jobData, positionData) => {
    const basePay = jobData.CoinsPerMin * positionData.payMultiplier || 5;
    const minCoins = basePay * 20;
    const maxCoins = basePay * 50;
    const coinsBooster = profile.booster.coins || 1.0;
    const coinsEarned = Math.floor(Math.random() * (maxCoins - minCoins + 1) + minCoins) * coinsBooster;
    
    const xpEarned = 100; // * playerRewards.workXP;

    return { minCoins, maxCoins, coinsEarned, xpEarned };
};