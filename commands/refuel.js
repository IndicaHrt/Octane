const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { passiveRefuel, refillFuel } = require('../utils/main');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('refuel')
        .setDescription('Refuel your active vehicle completely.'),
    category: 'Economy',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        const now = DateTime.now().setZone('America/New_York');
        const playerVehicle = profile.vehicles.find(v => v.isActive);
        if (!playerVehicle) {
            return interaction.reply('No active vehicle found.');
        }

        if (profile.lastRefuel && now.diff(DateTime.fromJSDate(profile.lastRefuel)).as('minutes') < 30) {
            const timeRemaining = 30 - now.diff(DateTime.fromJSDate(profile.lastRefuel)).as('minutes');

            return interaction.reply(`:no_entry: Fuel Station is closed, come back in ${Math.ceil(timeRemaining).toLocaleString()} minutes.`);
        }

        if (playerVehicle.stats.currentFuel === playerVehicle.stats.fuelCapacity) {
            return interaction.reply('Your fuel tank is already full.');
        }

        const fuelNeeded = playerVehicle.stats.fuelCapacity - playerVehicle.stats.currentFuel;
        const fuelCost = fuelNeeded * 8;

        if (profile.coins < fuelCost) {
            return interaction.reply({ content: `Not enough coins. You need ${fuelCost.toLocaleString()} <:coins:1269411594685644800> to refuel.`, ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Refuel Car')
            .setDescription(`Fuel Cost: ${fuelCost.toLocaleString()} <:coins:1269411594685644800> for ${fuelNeeded}%\n\nPress the button to start refueling.`)
            .setFooter({ text: `You have ${profile.coins.toLocaleString()} coins.` });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('startFueling')
                    .setLabel('Start Refueling')
                    .setStyle(ButtonStyle.Success)
            );

        await interaction.reply({ embeds: [embed], components: [row] });

        const filter = i => i.customId === 'startFueling' && i.user.id === interaction.user.id;
        const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000, max: 1 });

        collector.on('collect', async i => {
            await i.update({
                content: 'Fueling...',
                components: [new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setCustomId('fueling')
                    .setLabel('Fueling...')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
                )]
            });

            setTimeout(async () => {
                profile.coins -= fuelCost;
                playerVehicle.stats.currentFuel = playerVehicle.stats.fuelCapacity;
                profile.lastRefuel = now.toJSDate();
                await profile.save();

                await i.editReply({
                    content: `Refueling complete! Your vehicle is now fully fueled.`,
                    embeds: [],
                    components: []
                });
            }, 5000);
        });
    }
};