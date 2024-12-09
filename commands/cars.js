const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { Profile, Vehicle } = require('../models');
const { DateTime } = require('luxon');
const { getLogger } = require('../utils/logging');
const { getDealerEmbed } = require('../utils/getEmbed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cars')
        .setDescription('View and buy the stock of cars.'),
    category: 'Economy',
    async execute(interaction) {
        let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        //const forSaleCars = await Vehicle.find({ forSale: true }).sort({ id: 1 }).lean();
        const forSaleCars = await Vehicle.find({}).sort({ id: 1 }).lean();
        if (forSaleCars.length === 0) {
            await interaction.reply('No cars available for sale that you can afford.', { ephemeral: true });
            return;
        }

        try {
            let pageIndex = 0;
            let e = await getDealerEmbed(interaction, forSaleCars, pageIndex);

            const message = await interaction.reply({ embeds: [e.embed], components: [e.row], files: [e.vehicleImage], fetchReply: true });
            const filter = i => ['previous', 'next', 'buy'].includes(i.customId) && i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                await i.deferUpdate();
                switch (i.customId) {
                    case 'previous':
                        pageIndex = Math.max(pageIndex - 1, 0);
                        break;
                    case 'next':
                        pageIndex = Math.min(pageIndex + 1, forSaleCars.length - 1);
                        break;
                    case 'buy':
                        const car = forSaleCars[pageIndex];
                        if (profile.coins < car.price) {
                            await interaction.editReply({ content: `You do not have enough Coins to buy the ${car.make} ${car.model}. You need $${(car.price - profile.coins).toLocaleString()} more.`, ephemeral: true });
                            return;
                        }

                        if (profile.vehicles.find(v => v.vehicleId === car._id)) {
                            await interaction.editReply({ content: `You already own the ${car.make} ${car.model}.`, ephemeral: true });
                            return;
                        }

                        if (profile.vehicles.length >= 2) {
                            await interaction.editReply({ content: `Your garage can only store 2 vehicles.`, ephemeral: true });
                            return;
                        }
                    
                        profile.coins -= car.price;
                        profile.vehicles.push(car);
                        // Set the first car as active and the rest as inactive
                        profile.vehicles.forEach((v, index) => v.isActive = index === 0);
                        await profile.save();
                        await interaction.editReply({ content: `You have purchased the ${car.make} ${car.model}.`, embeds: [], components: [], files: [] });
                        collector.stop();
                        break;
                }

                let e = await getDealerEmbed(interaction, forSaleCars, pageIndex);
                await i.editReply({ embeds: [e.embed], components: [e.row], files: [e.vehicleImage], fetchReply: true });
            });

            collector.on('end', () => {
                interaction.editReply({ content: 'Dealer session has ended.', components: [] });
            });
        } catch (error) {
            logger.error(interaction.user.tag + ' | dealer: ' + error);
            interaction.reply('An error occurred while viewing the dealer.', { ephemeral: true });
        }
    }
};