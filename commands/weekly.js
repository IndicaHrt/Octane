const { SlashCommandBuilder } = require('@discordjs/builders');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { giveCoins, rewardsTable } = require('../utils/main');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('weekly')
        .setDescription('Claim your weekly reward!'),
    category: 'Rewards',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        const lastClaimed = DateTime.fromJSDate(profile.lastWeekly);
        const now = DateTime.now().setZone('America/New_York');
        const nextClaim = lastClaimed.plus({ weeks: 1 }).startOf('week');

        if (now < nextClaim) {
            const timeToReset = nextClaim.diff(now).toFormat("dd 'days', hh 'hours'");
            return interaction.reply(`Next Weekly in ${timeToReset}.`);
        }

        try {
            const rewards = await rewardsTable(profile);

            await giveCoins(profile, rewards.weeklyCoins, 'Weekly rewards');
            profile.lastWeekly = now.toJSDate();
            profile.weeklyCount += 1;
            await profile.save();
            interaction.reply(`You have claimed your weekly reward of ${rewards.weeklyCoins} <:coins:1269411594685644800>!`);
        } catch (err) {
            logger.error(interaction.user.tag+' | weekly: '+err);
            return interaction.reply('An error occurred while processing your weekly reward.', { ephemeral: true });
        }        
    }
};
