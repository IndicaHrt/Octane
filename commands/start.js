const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLogger } = require('../utils/logging');
const { Profile, Vehicle } = require('../models');
const { getStartEmbed } = require('../utils/getEmbed');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('start')
        .setDescription('Get started by choosing your first vehicle!'),
    category: 'Misc',
    async execute(interaction) {
        let logger = await getLogger();
        let profile = await Profile.findOne({ userId: interaction.user.id });
        if (profile && profile.userId !== '102688836454203392') {
            return interaction.reply({ content: 'You already have a profile.', ephemeral: true });
        }

        const starterCars = await Vehicle.find({ isStarterCar: true }).sort({ id: 1 }).lean();
        if (starterCars.length === 0) {
            await interaction.reply({ content: 'No starter vehicles found.', ephemeral: true });
            return;
        }

        try {
            let pageIndex = 0;
            let e = await getStartEmbed(interaction, starterCars, pageIndex);

            const message = await interaction.reply({ content: 'Please select your starter vehicle:', embeds: [e.embed], components: [e.row], files: [e.vehicleImage], fetchReply: true });
            const filter = i => ['previous', 'next', 'select'].includes(i.customId) && i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                await i.deferUpdate();

                switch (i.customId) {
                    case 'previous':
                        pageIndex = Math.max(pageIndex - 1, 0);
                        break;
                    case 'next':
                        pageIndex = Math.min(pageIndex + 1, starterCars.length - 1);
                        break;
                    case 'select':
                        const vehicle = starterVehicles[pageIndex];
                        try {
                            if (!vehicle) {
                                await i.update({ content: "Selected vehicle not found.", components: [] });
                                return;
                            }
                            profile = await Profile.create({
                                userId: interaction.user.id,
                                guildId: interaction.guildId,
                                username: interaction.user.username,
                                vehicles: [{ vehicleId: vehicle._id, year: vehicle.year, make: vehicle.make, model: vehicle.model, isActive: true, stats: vehicle.stats, image: vehicle.image }]
                            });
                        } catch (error) {
                            logger.error(interaction.user.tag+' | start: '+error);
                            return i.update({ content: 'Failed to create profile.', components: [] });
                        }            
            
                        embed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle(`Welcome to Octane ${profile.username} Racing!`)
                            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                            .setDescription('Your profile has been successfully set up!')
                            .addFields(
                                { name: 'Free Vehicle', value: `You have received a free ${vehicle.make} ${vehicle.model}!` },
                                { name: 'Get Started', value: 'Use `/race` to start racing immediately' },
                                { name: 'Check Profile', value: 'Use `/profile` to view your profile and stats' },
                                { name: 'Buy Vehicles', value: 'Use `/cars` to view all vehicles' },
                                { name: 'Check Cooldowns', value: 'Use `/cooldowns` to view your cooldowns' }
                            )
                            .setFooter({ text: 'Type /help for a command list and more information' });
                        await i.update({ content: '', embeds: [embed], components: [], files: [] });
                        collector.stop();
                        break;
                }

                let e = await getStartEmbed(interaction, starterCars, pageIndex);
                await i.editReply({ embeds: [e.embed], components: [e.row], files: [e.vehicleImage], fetchReply: true });
            });

            collector.on('end', () => {
                interaction.editReply({ content: 'You did not select a vehicle, session ended.', components: [] });
            });

        } catch (error) {
            logger.error(interaction.user.tag+' | start: '+error);
            interaction.reply({ content: 'An error occurred while setting up your profile.', ephemeral: true });
        }
    }
};