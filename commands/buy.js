const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Profile, Item } = require('../models');
const { getLogger } = require('../utils/logging');
const { getItemDetails, itemPurchase } = require('../utils/main');
const { DateTime } = require('luxon');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Purchase items from the store')
        .addStringOption(option => 
            option.setName('item')
                .setDescription('The ID of the item to buy')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('quantity')
                .setDescription('The number of items to buy')
                .setRequired(false)
                .setMinValue(1)),
    category: 'Economy',
    async execute(interaction) {
        const logger = await getLogger();
        let item = interaction.options.getString('item').toLowerCase();
        let quantity = interaction.options.getInteger('quantity') || 1;
        
        const profile = await Profile.findOne({ userId: interaction.user.id });

        // Item alias mapping
        if (item === 'xp') item = 'booster_xp';
        if (item === 'coins') item = 'booster_coins';
        if (item === 'junkyard') item = 'junkyard_pass';

        try {
            const itemDetails = await getItemDetails(item);
            if (!itemDetails || !itemDetails.enabled) {
                await interaction.reply({ content: "Item not found or is currently disabled.", ephemeral: true });
                return;
            }
            quantity = itemDetails.type === 'booster' ? 1 : quantity;
            const totalCost = itemDetails.totalCost * quantity;

            //logger.info(`${interaction.user.tag} | buy: ${item} ${quantity}x totalCost: ${itemDetails.totalCost}`);

            const now = DateTime.now().setZone('America/New_York');
            const xpActive = profile.booster.xpExpires > now;
            const coinsActive = profile.booster.coinsExpires > now;
            let itemPrice = '';
            if (itemDetails.currency === 'coins' || itemDetails.currency === null) {
                itemPrice = totalCost.toLocaleString() + ' <:coins:1269411594685644800>';
            } else {
                itemPrice = totalCost.toLocaleString() + ' ' + itemDetails.currency;
            }
    
            if (item === 'booster_xp' && xpActive) {
                await interaction.reply({ content: `You already have an active XP booster.`, ephemeral: true });
                return;
            } else if (item === 'booster_coins' && coinsActive) {
                await interaction.reply({ content: `You already have an active Coins booster.`, ephemeral: true });
                return;
            }           
    
            const embed = new EmbedBuilder()
                .setTitle('Confirm Purchase')
                .setDescription(`Are you sure you want to buy ${quantity} x ${itemDetails.name} for ${itemPrice}?`)
                .setFields([
                    { name: 'Item', value: itemDetails.name, inline: true },
                    { name: 'Quantity', value: quantity.toString(), inline: true },
                    { name: 'Total Cost', value: totalCost.toString(), inline: true }
                ])
                .setFooter({ text: `Your Coins: ${profile.coins.toLocaleString()}` });
    
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('confirm_purchase')
                        .setLabel('Confirm')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(profile.coins < totalCost),
                    new ButtonBuilder()
                        .setCustomId('cancel_purchase')
                        .setLabel('Cancel')
                        .setStyle(ButtonStyle.Danger)
                );
    
            const message = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true, ephemeral: true });
            
            const filter = i => i.user.id === interaction.user.id && (i.customId === 'confirm_purchase' || i.customId === 'cancel_purchase');
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });
                
            collector.on('collect', async i => {
                if (i.customId === 'confirm_purchase') {
                    await itemPurchase(profile, item, quantity);
                    await i.update({ content: `You have successfully purchased ${quantity} ${itemDetails.name} for ${itemPrice}`, embeds: [], components: [], ephemeral: true });
                } else if (i.customId === 'cancel_purchase') {
                    await i.update({ content: 'Purchase cancelled.', embeds: [], components: [], ephemeral: true });
                }
            });
    
        } catch (err) {
            logger.error(`${interaction.user.tag} | buy: ${err}`);
            await interaction.reply({ content: 'An error occurred while preparing your purchase.', ephemeral: true });
        }
    }
};



