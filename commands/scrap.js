const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getLogger } = require('../utils/logging');
const { giveCoins } = require('../utils/main');
const { Profile } = require('../models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('scrap')
        .setDescription('Sell unusable parts from your inventory.'),
    category: 'Economy',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        const scrapParts = profile.inventory.filter(item => item.condition !== "Usable" && item.category === "Part");
        if (scrapParts.length < 1) {
            await interaction.reply({ content: "You don't have any parts to scrap.", ephemeral: true });
            return;
        }

        try {
            const scrapValue = scrapParts.reduce((acc, item) => acc + item.value, 0);
            profile.inventory = profile.inventory.filter(item => item.condition === "Usable" || item.category !== "Part");
            await profile.save();

            await giveCoins(profile, scrapValue, 'Scrapped parts');
    
            await interaction.reply({ content: `Your unusable parts have been scrapped for ${scrapValue.toLocaleString()} <:coins:1269411594685644800>`, ephemeral: false });
        } catch (error) {
            logger.error(interaction.user.tag+' | scrap: '+error);
            await interaction.reply({ content: "An error occurred while scrapping your parts.", ephemeral: true });
        }
        
    }
};