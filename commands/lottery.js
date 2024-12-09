const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonStyle, ButtonBuilder } = require('discord.js');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { giveXP, giveCoins, resetLuckyTokens } = require('../utils/main');
const { getLogger } = require('../utils/logging');

const prizes = [
    { emoji: '<:coins:1269411594685644800>', description: 'Coin', probability: 0.5, reward: { type: 'coin', value: 3000 } },
    { emoji: '<:coins:1269411594685644800>', description: 'Coin', probability: 1, reward: { type: 'coin', value: 300 } },
    { emoji: '<:coins:1269411594685644800>', description: 'Coin', probability: 1.5, reward: { type: 'coin', value: 150 } },
    { emoji: '<:coins:1269411594685644800>', description: 'Coin', probability: 2, reward: { type: 'coin', value: 75 } },
    { emoji: '<:coins:1269411594685644800>', description: 'Coin', probability: 4, reward: { type: 'coin', value: 50 } },
    { emoji: '<:coins:1269411594685644800>', description: 'Coin', probability: 6, reward: { type: 'coin', value: 25 } },
    { emoji: '<:coins:1269411594685644800>', description: 'Coin', probability: 7, reward: { type: 'coin', value: 10 } },

    { emoji: '💡', description: 'XP', probability: 1, reward: { type: 'xp', value: 1250 } },
    { emoji: '💡', description: 'XP', probability: 2, reward: { type: 'xp', value: 500 } },
    { emoji: '💡', description: 'XP', probability: 3, reward: { type: 'xp', value: 275 } },
    { emoji: '💡', description: 'XP', probability: 4, reward: { type: 'xp', value: 150 } },
    { emoji: '💡', description: 'XP', probability: 6, reward: { type: 'xp', value: 75 } },
    { emoji: '💡', description: 'XP', probability: 8, reward: { type: 'xp', value: 45 } },
    { emoji: '💡', description: 'XP', probability: 10, reward: { type: 'xp', value: 30 } },
    { emoji: '💡', description: 'XP', probability: 12, reward: { type: 'xp', value: 15 } },

    { emoji: '', description: 'Premium Coupon', probability: 0.25, reward: { type: 'supplyCouponT2', value: 3 } },
    { emoji: '', description: 'Premium Coupon', probability: 0.5, reward: { type: 'supplyCouponT2', value: 1 } },

    { emoji: '', description: 'Basic Coupon', probability: 0.5, reward: { type: 'supplyCouponT1', value: 6 } },
    { emoji: '', description: 'Basic Coupon', probability: 1, reward: { type: 'supplyCouponT1', value: 3 } }
];


async function calculateLotteryReward(profile) {
    const rand = (Math.random() * 50) + (profile.stats.luck || 0);
    let sum = 0;
    for (const prize of prizes) {
        sum += prize.probability;
        if (rand < sum) {
            return prize;
        }
    }

    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lottery')
        .setDescription('Spin the wheel to win prizes! Requires Lucky Tokens.'),
    category: 'Rewards',
    async execute(interaction, guildSettings, client) {
        let logger = await getLogger();
        let profile = await Profile.findOne({ userId: interaction.user.id });

        if (!profile.luckyTokens || profile.luckyTokens < 1) {
            return interaction.reply('You do not have any Lucky Tokens to play the lottery.', { ephemeral: true });
        }

        function generateEmbed(first, results) {
            if (first) {
                return new EmbedBuilder()
                    .setTitle(`🎰 **Lottery** 🎰`)
                    .setDescription(`<:lotterytoken:1269399775065804862> Lucky Tokens: ${profile.luckyTokens}\n\nUse the buttons below to draw with 1, 5, or 10 tokens.`)
                    .setColor(0x00AE86);
            }            
            return new EmbedBuilder()
                .setTitle(`🎰 **Lottery Results** 🎰`)
                .setDescription(`<:lotterytoken:1269399775065804862> Lucky Tokens: ${profile.luckyTokens}\n\n**Rewards:**\n`+results.join('\n'))
                .setFooter({ text: `You have played the lottery ${profile.lotteryCount} times.` })
                .setColor(0x00AE86);
        }
    
        const embed = generateEmbed(true);
        const row = new ActionRowBuilder();

        row.addComponents(
            new ButtonBuilder().setCustomId('one').setLabel('One').setStyle(ButtonStyle.Secondary).setDisabled(false),
            new ButtonBuilder().setCustomId('five').setLabel('Five').setStyle(ButtonStyle.Secondary).setDisabled(profile.luckyTokens < 5),
            new ButtonBuilder().setCustomId('ten').setLabel('Ten').setStyle(ButtonStyle.Primary).setDisabled(profile.luckyTokens < 10)
        );

        const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        const filter = i => i.user.id === interaction.user.id && (i.customId === 'one' || i.customId === 'five' || i.customId === 'ten');
        const collector = message.createMessageComponentCollector({ filter, time: 60000 });
        let results = [];

        collector.on('collect', async i => {
            if (i.customId === 'one') {
                results = await drawLottery(profile, 1, i, client);
            } else if (i.customId === 'five') {
                results = await drawLottery(profile, 5, i, client);
            } else if (i.customId === 'ten') {
                results = await drawLottery(profile, 10, i, client);
            }

            try {
                await i.update({ content: '🎰 Spinning...', embeds: [], components: [] });
                setTimeout(async () => {
                    await i.editReply({ content: '', embeds: [generateEmbed(false, results)], components: [] });
                }, 3000);
            } catch (error) {
                logger.error(interaction.user.tag+' | lottery: '+error);
            }
        });

    }
};

async function drawLottery(profile, count, interaction, client) {
    let logger = await getLogger();
    let results = [];
    for (let i = 0; i < count; i++) {
        const prize = await calculateLotteryReward(profile);
        if (!prize) {
            logger.error(interaction.user.tag+' | lottery: No prize could be calculated.');
            continue;
        }

        if(prize.reward.type === 'coin') {
            await giveCoins(profile, prize.reward.value, 'Lottery rewards');
        }
        if(prize.reward.type === 'xp') {
            await giveXP(profile, interaction.guildId, prize.reward.value, client, 'Lottery rewards'); 
        }

        results.push(`${prize.emoji} ${prize.reward.value} ${prize.description}`);
    }

    profile.luckyTokens -= count;
    profile.lastLotteryPlay = DateTime.now().setZone('America/New_York').toJSDate();
    profile.lotteryCount = (profile.lotteryCount || 0) + count;
    await profile.save();

    return results;
}