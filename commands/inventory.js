const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Profile } = require('../models');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Displays your inventory.'),
    category: 'General',
    async execute(interaction) {
        let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });

        try {
            // Filter inventory for category 'Part'
            const parts = profile.inventory.filter(item => item.category === 'Part');
            const partsSummary = parts.reduce((acc, item) => {
                if (!acc[item.name]) {
                    acc[item.name] = {};
                }
                if (!acc[item.name][item.condition]) {
                    acc[item.name][item.condition] = 0;
                }
                acc[item.name][item.condition]++;
                return acc;
            }, {});
    
            const inventoryValue = profile.inventory.reduce((acc, item) => acc + item.value, 0);
            const embed = new EmbedBuilder()
                .setTitle(`${interaction.user.username}'s Inventory`)
                .setColor('#00ff00')
                .setDescription(`*Broken, Damaged, and Worn parts can be scrapped with /scrap*\n*Usable parts can be equipped with /upgrade*`)
                .setFooter({ text: `Total Value: ${Math.floor(inventoryValue)} coins` });
    
            Object.entries(partsSummary).forEach(([part, conditions]) => {
                let description = '';
                Object.entries(conditions).forEach(([condition, count]) => {
                    const icon = condition === 'Usable' ? ':tools:' : '♻️';
                    description += `${icon} ${condition}: ${count}\n`;
                });
                embed.addFields({ name: part, value: description, inline: true });
            });
    
            // Add a button to scrap items
            const scrappableParts = profile.inventory.filter(item => item.condition !== 'Usable');
            const rows = [];
            const buttons = [];
    
            if (scrappableParts.length > 0) {
                buttons.push(new ButtonBuilder()
                    .setCustomId('execute_scrap')
                    .setLabel('Scrap Items')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('♻️')
                );
            }
    
            if (buttons.length > 0) {
                rows.push(new ActionRowBuilder().addComponents(buttons));
            }

            try {
                await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });
                
            } catch (error) {
                logger.error(interaction.user.tag+' | inventory: '+error);
                await interaction.reply('An error occurred while generating the inventory embed.', { ephemeral: true });
            }
        } catch (error) {
            logger.error(interaction.user.tag+' | inventory: '+error);
            await interaction.reply('An error occurred while generating the inventory embed.', { ephemeral: true });
        }
    }
};
