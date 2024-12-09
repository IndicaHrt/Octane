const { SlashCommandBuilder, EmbedBuilder, MessageAttachment } = require('discord.js');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { getLogger } = require('../utils/logging');

const setCustomOptions = new SlashCommandBuilder()
    .setName('customize')
    .setDescription('Customize your profile settings.')
    .addStringOption(option =>
        option.setName('username')
            .setDescription('Set a custom username for your profile (1-32 characters)')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('backgroundcolor')
            .setDescription('Set your profile\'s background color (Hex code, e.g., #FFFFFF or FFFFFF)')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('bordercolor')
            .setDescription('Set your profile\'s border color (Hex code, e.g., #FFFFFF or FFFFFF)')
            .setRequired(false))
    .addStringOption(option =>
        option.setName('xpcolor')
            .setDescription('Set your profile XP bar color (Hex code, e.g., #FFFFFF or FFFFFF)')
            .setRequired(false));
module.exports = {
    data: setCustomOptions,
    category: 'Misc',
    async execute(interaction) {
    let logger = await getLogger();
        const now = DateTime.now().setZone('America/New_York');
        const profile = await Profile.findOne({ userId: interaction.user.id });
        const backgroundColor = interaction.options.getString('backgroundcolor');
        const borderColor = interaction.options.getString('bordercolor');
        const xpColor = interaction.options.getString('xpcolor');
        const customUsername = interaction.options.getString('username');

        logger.debug(`Updating profile settings for ${interaction.user.id}\nBackground color: ${backgroundColor} Border color: ${borderColor} XP color: ${xpColor} Custom username: ${customUsername}`);

        if (backgroundColor && !/^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(backgroundColor)) {
            return interaction.reply({ content: 'Invalid color code. Please enter a valid hex code (e.g., #FFFFFF or FFFFFF).', ephemeral: true });
        }
        if (borderColor && !/^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(borderColor)) {
            return interaction.reply({ content: 'Invalid color code. Please enter a valid hex code (e.g., #FFFFFF or FFFFFF).', ephemeral: true });
        }
        if (xpColor && !/^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(xpColor)) {
            return interaction.reply({ content: 'Invalid color code. Please enter a valid hex code (e.g., #FFFFFF or FFFFFF).', ephemeral: true });
        }

        if (customUsername && (customUsername.length < 1 || customUsername.length > 32)) {
            return interaction.reply({ content: 'Invalid username. The length must be between 1 and 32 characters.', ephemeral: true });
        }

        try {
            if (backgroundColor) {
                profile.settings.backgroundColor = backgroundColor.startsWith('#') ? backgroundColor : `#${backgroundColor}`;
            }
            if (borderColor) {
                profile.settings.borderColor = borderColor.startsWith('#') ? borderColor : `#${borderColor}`;
            }
            if (xpColor) {
                profile.settings.xpColor = xpColor.startsWith('#') ? xpColor : `#${xpColor}`;
            }
            if (customUsername) {
                profile.username = customUsername;
            }
            profile.settings.profileLastUpdate = now;
    
            await profile.save();
            return interaction.reply('Profile customization has been updated successfully!', { ephemeral: true });
        } catch (error) {
            logger.error(interaction.user.tag+' | customize: '+error);
            return interaction.reply('An error occurred while updating your profile settings. Please try again later.', { ephemeral: true });
        }

    }
};
