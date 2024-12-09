const { SlashCommandBuilder } = require('@discordjs/builders');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { giveCoins, rewardsTable } = require('../utils/main');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily reward!'),
    category: 'Rewards',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });

        const lastClaimed = DateTime.fromJSDate(profile.lastDaily);
        const now = DateTime.now().setZone('America/New_York');
        const nextClaim = lastClaimed.plus({ days: 1 }).startOf('day');

        if (now < nextClaim) {
            const timeToReset = nextClaim.diff(now).toFormat("hh 'hours', mm 'minutes'");
            return interaction.reply(`Next Daily in ${timeToReset}.`);
        }

        try {
            const rewards = await rewardsTable(profile);

            await giveCoins(profile, rewards.dailyCoins, 'Daily rewards');
            profile.lastDaily = now.toJSDate();
            profile.dailyCount += 1;
            await profile.save();
            return interaction.reply(`You have claimed your daily reward of ${rewards.dailyCoins} <:coins:1269411594685644800>!`);
        } catch (err) {
            logger.error(interaction.user.tag+' | daily: '+err);
            return interaction.reply('An error occurred while processing your daily reward.', { ephemeral: true });
        }
    }
};
