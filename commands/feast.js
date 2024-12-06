const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feast')
        .setDescription('Open the Feast Menu to collect supplies for blessings.'),
    category: 'Rewards',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        let now = DateTime.now().setZone('America/New_York').toJSDate()

        if (!profile) {
            return interaction.reply('You do not have a profile yet.', { ephemeral: true });
        }

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

            let e = await generateEmbed(profile);

            const message = await interaction.reply({ embeds: [e.embed], components: e.rows, fetchReply: true });
            const filter = i => i.user.id === interaction.user.id && (i.customId === 't1' || i.customId === 't2' || i.customId === 'collectSupplies');
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                if (i.customId === 't1' || i.customId === 't2') {
                    const run = profile.supplyRuns.find(run => run.state === 'Available');
                    if (!run) {
                        return i.editReply({ content: 'No supply runs available.', ephemeral: true });
                    }

                    run.state = 'In Progress';
                    run.startTime = DateTime.now().setZone('America/New_York').toJSDate();
                    run.couponType = i.customId;
                    if (profile.supplyCouponT1 === 0 && i.customId === 't1') {
                        return i.editReply({ content: 'You do not have any basic coupons.', ephemeral: true });
                    } else if (profile.supplyCouponT2 === 0 && i.customId === 't2') {
                        return i.editReply({ content: 'You do not have any premium coupons.', ephemeral: true });
                    }
                    if (i.customId === 't1') {
                        run.endTime = DateTime.now().setZone('America/New_York').plus({ minutes: 60 }).toJSDate(); // 1hr
                    } else if (i.customId === 't2') {
                        run.endTime = DateTime.now().setZone('America/New_York').plus({ minutes: 90 }).toJSDate(); // 1.5 hrs
                    }
                    profile.supplyCouponT1 -= i.customId === 't1' ? 1 : 0;
                    profile.supplyCouponT2 -= i.customId === 't2' ? 1 : 0;
                    profile.supplyCouponsSpent += 1;
                    await profile.save();

                    e = await generateEmbed(profile);
                    await i.update({ embeds: [e.embed], components: e.rows, fetchReply: true });
                } else if (i.customId === 'collectSupplies') {
                    // Find all runs that are ready to collect
                    const runs = profile.supplyRuns.filter(run => run.state === 'Ready to Collect');
                    if (runs.length === 0) {
                        return i.editReply({ content: 'No supply runs are ready to collect.', ephemeral: true });
                    }

                    let totalRewards = 0;
                    let bonusRewards = 0;
                    // Use player luck stat to determine propability of receiving tier 2 coupons
                    let luck = profile.luck;
                    runs.forEach(async (run) => {
                        let chance = Math.floor(Math.random() * 100);
                        if (luck > 0) {
                            chance -= luck;
                        }
                        if (chance <= 10) {
                            profile.supplyCouponT2 += 1;
                            bonusRewards += 1;
                        }
                        rewards = await supplyRewards(run.couponType);
                        profile.feastSupplies += rewards;
                        profile.lastFeastRun = DateTime.now().setZone('America/New_York').toJSDate();
                        totalRewards += rewards;
                        run.state = 'Available';
                        run.couponType = null;
                    });
                    await profile.save();

                    const rewardsMessage = bonusRewards > 0 ? `You collected ${totalRewards}x Feast Supplies and received ${bonusRewards}x Tier 2 Coupon(s).` : `You collected ${totalRewards}x Feast Supplies.`;
                    
                    e = await generateEmbed(profile);
                    await i.update({ content: `${rewardsMessage}`, embeds: [e.embed], components: e.rows, fetchReply: true });
                }
                return;
            });

            collector.on('end', async () => {
                e = await generateEmbed(profile);
                await message.edit({ embeds: [e.embed], components: [] });
            });
        } catch (err) {
            logger.error(interaction.user.tag + ' | feast: ' + err);
            return interaction.reply('An error occurred while processing the feast command.', { ephemeral: true });
        }
    }
};

async function supplyRewards(couponType) {
    let logger = await getLogger();
    try {
        let reward = 0;
        if (couponType === 't1') {
            reward = 1;
        } else if (couponType === 't2') {
            reward = 5;
        }
        return reward;
    } catch (error) {
        logger.error(' | feast: ' + error);
    }
}

async function generateEmbed(profile) {
    const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle(`Feast - Supply Runs`)
        .setDescription(`<:feastSupplies:1286849566523654269> ${profile.feastSupplies}\n\n**Coupons:**\nBasic (1hr) - <:couponBasic:1286853815550742538> ${[profile.supplyCouponT1]}\nPremium (1.5hr) - <:couponPremium:1286853816859365408>  ${[profile.supplyCouponT2]}\n\n*Choose a coupon to start a supply run*\n`);

    now = DateTime.now().setZone('America/New_York').toJSDate()
    for (let i = 0; i < profile.supplyRuns.length; i++) {
        const run = profile.supplyRuns[i];
        let remainingTime = DateTime.fromJSDate(run.endTime).diff(DateTime.fromJSDate(now), 'minutes').toObject().minutes;
        remainingTime = Math.floor(remainingTime);

        let runDescription = run.state;
        let couponType = run.couponType === 't1' ? 'Basic' : run.couponType === 't2' ? 'Premium' : 'None';
        let couponReward = run.couponType === 't1' ? 1 : 5;
        if (run.state === 'In Progress' && remainingTime > 0) {            
            runDescription = `${couponReward}x Supplies\n${remainingTime} minutes remaining`;
        } else if (run.state === 'In Progress' && remainingTime <= 0) {
            runDescription = "Ready to Collect";
            run.state = 'Ready to Collect';
            await profile.save();
        } else if (run.state === 'Ready to Collect') {
            runDescription = "Ready to Collect";
        } else {
            runDescription = "Available";
        }
        embed.addFields({
            name: `Supply Run #${i + 1} - ${couponType}`,
            value: runDescription,
            inline: true
        });
    }

    const rows = [new ActionRowBuilder()];

    const collectButton = new ButtonBuilder()
        .setCustomId('collectSupplies')
        .setLabel('Collect Supplies')
        .setStyle(ButtonStyle.Success)
        .setDisabled(!profile.supplyRuns.some(run => run.state === 'Ready to Collect'));

    rows[0].addComponents(collectButton);

    if (profile.supplyCouponT1 > 0) {
        const tier1Button = new ButtonBuilder()
            .setCustomId('t1')
            .setLabel('Basic')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!profile.supplyRuns.some(run => run.state === 'Available'));
        rows[0].addComponents(tier1Button);
    }
    if (profile.supplyCouponT2 > 0) {
        const tier2Button = new ButtonBuilder()
            .setCustomId('t2')
            .setLabel('Premium')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(!profile.supplyRuns.some(run => run.state === 'Available'));
        rows[0].addComponents(tier2Button);
    }

    return { embed, rows };
}