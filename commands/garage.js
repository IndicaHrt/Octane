const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Profile } = require('../models');
const { generateVehiclestats, generateStatsText } = require('../utils/main');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('garage')
        .setDescription('View your stored cars and their stats.'),
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });

        const vehicles = profile.vehicles;
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Your Garage')
            .setDescription('Here are your vehicles and their stats:');

        for (const vehicle of vehicles) {
            const vehicleStats = await generateVehiclestats(profile, vehicle);
            const vehicleStatsText = await generateStatsText(vehicleStats);
            const statsText = `${vehicleStatsText.speedText}\n${vehicleStatsText.accelText}\n${vehicleStatsText.gripText}\n${vehicleStatsText.suspensionText}\n${vehicleStatsText.brakesText}\n\n\n${vehicle.stats.currentFuel.toLocaleString()}% Fuel`;
            embed.addFields({
                name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
                value: statsText,
                inline: true
            });
        }
    
        const row = new ActionRowBuilder();
        vehicles.forEach((vehicle, index) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`select_vehicle_${index}`)
                    .setLabel(`Set ${index + 1} Active`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(vehicle.isActive)
            );
        });
    
        await interaction.reply({ embeds: [embed], components: [row] });

        const filter = i => i.user.id === interaction.user.id && i.customId.startsWith('select_vehicle');
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60000 });
    
        collector.on('collect', async i => {
            const index = parseInt(i.customId.split('_').pop());
            try {
                profile.vehicles.forEach(v => v.isActive = false);
                profile.vehicles[index].isActive = true;
                profile.markModified('vehicles');
                await profile.save();
            } catch (error) {
                logger.error('Error setting vehicle active status: ' + error);
            }            
        
            const newRow = new ActionRowBuilder();
            vehicles.forEach((vehicle, idx) => {
                newRow.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`select_vehicle_${idx}`)
                        .setLabel(`Set ${idx + 1} Active`)
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(idx === index)
                );
            });
        
            await i.update({ components: [newRow] });
            await i.followUp({ content: `Vehicle ${index + 1} is now active!`, ephemeral: true });
        });
    }
};
