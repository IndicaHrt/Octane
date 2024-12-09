const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { getLogger } = require('../utils/logging');
const { getSetting } = require('../utils/settingsCache');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays help information for commands.'),
    category: 'Misc',
    async execute(interaction) {
        let logger = await getLogger();
        const buttonRows = [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('general')
                    .setLabel('General')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('economy')
                    .setLabel('Economy')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('rewards')
                    .setLabel('Rewards')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('misc')
                    .setLabel('Misc')
                    .setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('guide')
                    .setLabel('Guide Home')
                    .setStyle(ButtonStyle.Secondary)
        )];

        try {
            const guideEmbed = await generateGuideEmbed();
            const message = await interaction.reply({ embeds: [guideEmbed], components: buttonRows, fetchReply: true, ephemeral: true });
            const filter = i => ['guide', 'general', 'economy', 'rewards', 'misc'].includes(i.customId) && i.user.id === interaction.user.id;
            const collector = message.createMessageComponentCollector({ filter, time: 60000 });

            collector.on('collect', async i => {
                let e = null;
                await i.deferUpdate();
                switch (i.customId) {
                    case 'guide':
                        e = await generateGuideEmbed();
                        break;
                    case 'general':
                        e = await generateHelpEmbedbyCat(interaction, 'General');
                        break;
                    case 'economy':
                        e = await generateHelpEmbedbyCat(interaction, 'Economy');
                        break;
                    case 'rewards':
                        e = await generateHelpEmbedbyCat(interaction, 'Rewards');
                        break;
                    case 'misc':
                        e = await generateHelpEmbedbyCat(interaction, 'Misc');
                        break;
                }

                await i.editReply({ embeds: [e], components: buttonRows, fetchReply: true, ephemeral: true });
            });

            collector.on('end', () => {
                interaction.editReply({ content: 'Help session has ended.', components: [], ephemeral: true });
            });
        } catch (error) {
            logger.error(interaction.user.tag + ' | help: ' + error);
            interaction.reply('An error occurred while viewing help.', { ephemeral: true });
        }
    }
};

async function generateGuideEmbed() {
    const botVersion = await getSetting('botVersion') || 'In-Development v0.0.0';
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Octane Guide')
        .setDescription('**Getting Started**\nTo create a profile, use the `/start` command. This will give you starter Coins and a car to start racing with.\n\n' +
            '**Ways to earn**\nThe best place to start is the `/cooldowns` command. This will show various ways to gain XP and Coins with their respective cooldowns.\n' +
            '* `/daily` - Gives some Coins each day\n* `/weekly` - Gives some Coins each week\n* `/work` - Gives some Coins and XP every 20 minutes\n' +
            '* `/race` - Gives significant Coins and XP for wins, increasing as you advance through the AI levels. There\'s tiny bit of rng when calculating odds, but is moslty based on vehicle stats\n' +
            '* `/afk` - Gives Coins and XP based on the time between claims. You can claim every 5 minutes or wait and collect in bulk\n' +
            '* `/lottery` - Gives Coins or XP with random odds between low and high amounts. 5 tickets per day')
        .setFooter({ text: botVersion });

    return embed;
}

async function generateHelpEmbedbyCat(interaction, category) {
    const botVersion = await getSetting('botVersion') || 'In-Development v0.0.0';
    const commands = interaction.client.commands;
    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`Category - ${category}`)
        .setDescription('Available commands:')
        .setFooter({ text: botVersion });

    commands.forEach(command => {
        if (command.category === category && command.data.name && command.data.description) {
            embed.addFields({ 
                name: `/${command.data.name}`, 
                value: command.data.description || 'No description available', 
                inline: true 
            });
        }
    });

    return embed;
}