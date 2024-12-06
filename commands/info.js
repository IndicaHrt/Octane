const { Client, SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const path = require('path');
const { Profile } = require('../models');
const { getLogger } = require('../utils/logging');
const { getSetting } = require('../utils/settingsCache');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('View information about the bot and its developers.'),
    category: 'Misc',
    async execute(interaction, guildSettings, client) {
        let logger = await getLogger();
        try {
            const botVersion = await getSetting('botVersion');
            const devID = await getSetting('devID');
            const devInviteURL = await getSetting('devInviteURL');
            const botInvite = await getSetting('botInvite');

            const logoPath = path.join(__dirname, '..', 'assets', 'logo1.png');
            const attachment = new AttachmentBuilder(logoPath, { name: 'logo.png' });
            const uptime = await getUptime(client);
            const profilesCount = await Profile.countDocuments();
            const commandCount = client.commands.size;
            
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`:robot: Octane`)
                .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setImage('attachment://logo.png')
                .setDescription('Octane is a multi-purpose bot with features such as economy, street racing, and minigames. It is inspired by games like Need for Speed and Forza Horizon.')
                .addFields(
                { name: 'Players', value: `${profilesCount.toLocaleString()}`, inline: true },
                { name: 'Servers', value: `${client.guilds.cache.size.toLocaleString()}`, inline: true },
                { name: 'Commands', value: `${commandCount.toLocaleString()}`, inline: true },
                { name: 'Developers', value: `<@${devID}>`, inline: true },
                //{ name: 'Links', value: `[Invite Octane to your server](${botInvite})\n[Join the Dev server](${devInviteURL})`, inline: true }
                { name: 'Links', value: `~~[Invite Octane to your server]~~\n*Invites disabled during beta testing*\n[Join the Dev server](${devInviteURL})`, inline: true }
                )
                .setFooter({ text: `Uptime: ${uptime} | ${botVersion}`});
            
            interaction.reply({ embeds: [embed], files: [attachment] });
        } catch (error) {
            logger.error(interaction.user.tag+' | info: '+error);
            interaction.reply('An error occurred while generating the embed.', { ephemeral: true });
        }
    }
};

async function getUptime(client) {
    const now = DateTime.now().setZone('America/New_York');
    const uptime = now.diff(DateTime.fromISO(client.startupTime));
    //return now.diff(startupTime, ['days', 'hours', 'minutes']).toObject();
    return `${uptime.days}d ${uptime.hours}h ${uptime.minutes}m`;
}