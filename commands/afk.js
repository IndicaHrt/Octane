const { SlashCommandBuilder, EmbedBuilder } = require('@discordjs/builders');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { giveXP, giveCoins, calculatePassiveIncome } = require('../utils/main');
const { getLogger } = require('../utils/logging');
const { checkProfile } = require('../utils/profileUtils');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Claim your AFK rewards!'),
    category: 'Rewards',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });

        const lastClaimed = DateTime.fromJSDate(profile.lastAFKClaim || new Date());
        const now = DateTime.now().setZone('America/New_York');
        let minutesSinceLastClaim = now.diff(lastClaimed, 'minutes').minutes;
        if (minutesSinceLastClaim > 2880) minutesSinceLastClaim = 2880;  // -max 48 hours
        const rewardMultiplier = Math.floor(minutesSinceLastClaim / 5);

        if (rewardMultiplier < 1) {
            const timeToNextReward = 5 - minutesSinceLastClaim;
            return interaction.reply(`You can claim your AFK rewards in ${Math.ceil(timeToNextReward)} minute(s).`, { ephemeral: true });
        }

        const passiveIncome = await calculatePassiveIncome(profile);
        const baseXP = passiveIncome.xpIncome / 60;
        const baseCoins = passiveIncome.moneyIncome / 60;
        const totalCoins = Math.floor(baseCoins * rewardMultiplier);
        const totalXP = Math.floor(baseXP * rewardMultiplier);

        logger.debug(`AFK Rewards: ${totalXP} XP | ${totalCoins} coins`);

        await giveXP(profile, interaction.guildId, totalXP, interaction.client, 'AFK rewards');
        await giveCoins(profile, totalCoins, 'AFK rewards');
        profile.lastAFKClaim = now.toJSDate();
        await profile.save();

        const embed = new EmbedBuilder()
            .setTitle(`AFK Rewards`)
            .setDescription(`You have claimed your AFK rewards!`)
            //.setColor('#00ff00') Idk why this is not working
            .addFields(
                { name: 'AFK Time', value: `${Math.ceil(minutesSinceLastClaim)} minute(s)`, inline: false },
                { name: 'Rewards', value: `${totalXP} XP\n${totalCoins} <:coins:1269411594685644800>`, inline: false }             
            )
            .setFooter({ text: 'You can claim AFK rewards every 5 minutes.' });

        try {
            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            logger.error(interaction.user.tag+' | afk: '+err);
            return interaction.reply('An error occurred while processing your AFK rewards.', { ephemeral: true });
        }
    }
};
