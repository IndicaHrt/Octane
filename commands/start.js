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

        const starterCars = await Vehicle.find({ isStarterCar: true }).sort({ id: 1 }).lean();
        if (starterCars.length === 0) {
            //await interaction.reply({ content: 'No starter vehicles found.', ephemeral: true });
            return;
        }

        //try {
            let pageIndex = 0;
            let e = await getStartEmbed(interaction, starterCars, pageIndex);
            const message = await interaction.reply({ content: 'Please select your starter vehicle:', embeds: [e.embed], components: [e.row], files: [e.vehicleImage] });
            
            const filter = i => ['previous', 'next', 'select'].includes(i.customId) && i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 600000 });

            collector.on('collect', async i => {
                await i.deferUpdate();
                if (i.customId === 'previous') {
                    pageIndex = Math.max(pageIndex - 1, 0);
                } else if (i.customId === 'next') {
                    pageIndex = Math.min(pageIndex + 1, starterCars.length - 1);
                } else if (i.customId === 'select') {
                    const vehicle = starterCars[pageIndex];
                    if (!vehicle) {
                        logger.error(interaction.user.tag+' | start: Vehicle not found - '+pageIndex);
                        return;
                    }
                    console.log(vehicle);
                    profile = await Profile.create({
                        userId: interaction.user.id,
                        guildId: interaction.guildId,
                        username: interaction.user.username,
                        vehicles: [{ vehicleId: vehicle._id, year: vehicle.year, make: vehicle.make, model: vehicle.model, isActive: true, stats: vehicle.stats, image: vehicle.image }]
                    });
                    let x = await getWelcomeEmbed(interaction, profile, vehicle);
                    await message.edit({ content: '', embeds: [x.embed], components: [], files: [] });
                    collector.stop();
                    return;
                }

                let v = await getStartEmbed(interaction, starterCars, pageIndex);
                await message.edit({ embeds: [v.embed], components: [v.row], files: [v.vehicleImage] });
            });

            collector.on('end', () => {
                message.edit({ content: 'Session ended...', components: [] });
            });

        //} catch (error) {
        //    logger.error(interaction.user.tag+' | start: '+error);
        //    //interaction.reply({ content: 'An error occurred while setting up your profile.', ephemeral: true });
        //}
    }
};

async function getWelcomeEmbed(interaction, profile, vehicle) {
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

    return { embed };
}