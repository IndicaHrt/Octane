const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const mongoose = require('mongoose');
const fs = require('fs');
require('dotenv').config();

const token = process.env.TOKEN;
const mongoUri = process.env.MONGO_URI;

const { loadSettings, getSetting } = require('./utils/settingsCache');
const { setupLogger, getLogger } = require('./utils/logging');
const GuildSettings = require('./models/GuildSettings');
const Profile = require('./models/Profile');
const { calculateLevel, updateBooster } = require('./utils/main');
const { getShrineEmbed } = require('./utils/getEmbed');

async function startBot() {
    if (!token) {
        console.log('Token is missing. Please set the TOKEN environment variable.');
        process.exit(1);
    }
    if (!mongoUri) {
        console.log('MongoDB URI is missing. Please set the MONGO_URI environment variable.');
        process.exit(1);
    }

    try {
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');
        await loadSettings();
        await setupLogger();
        const devID = await getSetting('devID');
        const supportGuildID = await getSetting('supportGuildID');
        const devGuildID = await getSetting('devGuildID');
        const botVersion = await getSetting('botVersion');
        let logger = await getLogger();

        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
            ],
        });

        client.commands = new Collection();
        const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(`./commands/${file}`);
            client.commands.set(command.data.name, command);
        }

        client.once('ready', async () => {
            const startupTime = DateTime.now().setZone('America/New_York').toISO();
            const profilesCount = await Profile.countDocuments();
            logger.info(`${client.user.tag} connected | Guilds: ${client.guilds.cache.size} | Users: ${client.users.cache.size} | Profiles: ${profilesCount} | Commands: ${client.commands.size} | Bot Version: ${botVersion}`);
        
            client.user.setPresence({ activities: [{ name: 'Use /help to learn more' }], status: 'online' });
            client.startupTime = startupTime;
            client.guilds.cache.forEach(async guild => {
                try {
                    const guildSettings = await GuildSettings.findOne({ guildId: guild.id });
                    if (!guildSettings) {
                        const newSettings = new GuildSettings({
                            guildId: guild.id,
                            name: guild.name,
                            allowedChannels: [],
                            levelupMessages: false,
                            levelupChannel: ''
                        });
                        await newSettings.save();
                        logger.debug(`Default settings saved for guild ${guild.name}`);
                        logger.info(`Joined guild ${guild.name}`);
                    }
                } catch (error) {
                    logger.error('updateGuildSettings: '+error);
                }
            });
        });
        
        client.on('guildMemberAdd', async member => {
            if (member.guild.id !== supportGuildID) return;
            // Support server welcome message
            if (member.user.bot) return;
        
            const channel = member.guild.channels.cache.find(ch => ch.name === 'lobby');
            if (!channel) return;
        
            try {
                const profile = await Profile.findOne({ userId: member.id, guildId: member.guild.id });
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('Welcome to Octane!')
                    .setDescription(`Hello ${member.user.username}, welcome to the support server for Octane!`);
        
                if (profile) {
                    const levelInfo = await calculateLevel(profile.xp);
                    embed.addFields(
                        { name: 'Level', value: `Level ${levelInfo.level} XP: ${Math.floor(profile.xp)} / ${Math.floor(levelInfo.nextLevelXp)}`, inline: true },
                        { name: 'Coins', value: `<:coins:1269411594685644800> ${profile.coins.toLocaleString()}`, inline: true }
                    );
                } else {
                    embed.addFields(
                        { name: 'Get Started', value: 'Type `/start` to create your racing profile and begin your journey!' }
                    );
                }
        
                embed.addFields(
                    { name: 'Help', value: 'If you need help or have suggestions, please visit the #issues or #suggestions channels.' }
                );
        
                await channel.send({ embeds: [embed] });
            } catch (error) {
                logger.error('guildMemberAdd: '+error);
            }
        });
        
        client.on('guildCreate', async guild => {
            try {
                const guildSettings = await GuildSettings.findOne({ guildId: guild.id });
                if (!guildSettings) {
                    const newSettings = new GuildSettings({
                        guildId: guild.id,
                        name: guild.name,
                        allowedChannels: [],
                        levelupMessages: false,
                        levelupChannel: ''
                    });
                    await newSettings.save();
                    logger.debug(`Default settings saved for guild ${guild.name}`);
                    logger.info(`Joined guild ${guild.name}`);
                }
            } catch (error) {
                logger.error('guildCreate: '+error);
            }
        });

        client.on('guildDelete', async guild => {
            try {
                if (guild.id === supportGuildID || guild.id === devGuildID) return;
                await GuildSettings.deleteOne({ guildId: guild.id });
                logger.info(`Left guild ${guild.name}`);
            } catch (error) {
                logger.error('guildDelete: '+error);
            }
        });
        
        client.on('interactionCreate', async interaction => {
            const guildSettings = await GuildSettings.findOne({ guildId: interaction.guild.id });
            const profile = await Profile.findOne({ userId: interaction.user.id });
        
            if (interaction.isCommand()) {
                const command = client.commands.get(interaction.commandName);
                if (!command) return;
        
                if (guildSettings && guildSettings.allowedChannels.length > 0 && !guildSettings.allowedChannels.includes(interaction.channelId)) {
                    return await interaction.reply({ content: 'This command is not allowed in this channel.', ephemeral: true });
                }
        
                if (profile) {
                    profile.lastMessageDate = DateTime.now().setZone('America/New_York');
                    await profile.save();
                    try {
                        await updateBooster(profile);
                    } catch (error) {
                        logger.error(interaction.user.tag + ' | ' + interaction.commandName + ': ' + error);
                    }
                }
        
                try {
                    if (interaction.user.id !== devID && (command === 'addjob' || command === 'addchallenge' || command === 'additem')) {
                        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                    }
                    await command.execute(interaction, guildSettings, client);
                    logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${interaction.commandName}`);
                } catch (error) {
                    logger.error(interaction.user.tag + ' | ' + interaction.commandName + ': ' + error);
                    if (!interaction.replied) {
                        await interaction.reply({ content: 'An error occurred while executing this command.', ephemeral: true });
                    } else {
                        await interaction.followUp({ content: 'An error occurred.', ephemeral: true });
                    }
                }
            } else if (interaction.isButton()) {
                if (interaction.customId === 'scrap_items') {
                    try {
                        const command = client.commands.get('scrap');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction, guildSettings, client);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to scrap items.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | scrap_items button: ' + error);
                    }
                } else if (interaction.customId === 'view_inventory') {
                    try {
                        const command = client.commands.get('inventory');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction, guildSettings, client);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to view inventory.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | view_inventory button: ' + error);
                    }
                } else if (interaction.customId === 'race_menu') {
                    try {
                        const command = client.commands.get('race');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to start streetrace.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | race_menu: ' + error);
                    }
                } else if (interaction.isButton() && interaction.customId.startsWith('toggle_lock_')) {
                    const index = parseInt(interaction.customId.split('_')[2], 10);
                    const profile = await Profile.findOne({ userId: interaction.user.id });
                    //console.log(interaction.customId.split('_'));
                    //console.log(`customId: ${interaction.customId} | index: ${index}`);

                    if (profile.blessings[index].locked) {
                        profile.blessings[index].locked = false;
                    } else {
                        profile.blessings[index].locked = true;
                    }
                    await profile.save();
            
                    const response = await getShrineEmbed(profile);
                    await interaction.update({ embeds: [response.embed], components: response.rows });
                } else if (interaction.customId === 'execute_afk') {
                    try {
                        const command = client.commands.get('afk');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction, guildSettings, client);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to go AFK.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | execute_afk button: ' + error);
                    }
                } else if (interaction.customId === 'execute_daily') {
                    try {
                        const command = client.commands.get('daily');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction, guildSettings, client);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to claim daily reward.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | execute_daily button: ' + error);
                    }
                }
                else if (interaction.customId === 'execute_weekly') {
                    try {
                        const command = client.commands.get('weekly');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction, guildSettings, client);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to claim weekly reward.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | execute_weekly button: ' + error);
                    }
                }
                else if (interaction.customId === 'execute_work') {
                    try {
                        const command = client.commands.get('work');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction, guildSettings, client);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to work.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | execute_work button: ' + error);
                    }
                } else if (interaction.customId === 'execute_refuel') {
                    try {
                        const command = client.commands.get('refuel');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction, guildSettings, client);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to refuel.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | execute_refuel button: ' + error);
                    }
                } else if (interaction.customId === 'execute_lottery') {
                    try {
                        const command = client.commands.get('lottery');
                        logger.info(`[${interaction.guild.name}] - ${interaction.user.tag}: ${command.data.name}`);
                        await command.execute(interaction, guildSettings, client);
                    } catch (error) {
                        await interaction.reply({ content: 'Failed to play the lottery.', ephemeral: true });
                        logger.error(interaction.user.tag + ' | execute_lottery button: ' + error);
                    }
                }
            }
        });
        
        
        client.on('messageCreate', async message => {
            if (message.author.bot || !message.guild) return;
            //const now = new Date();
            //const profile = await Profile.findOne({ userId: message.author.id, guildId: message.guild.id });
            //if (profile && (now - profile.lastXpTime > 300000)) { // 5 minutes cooldown
            //    const xpToAdd = await rewardsTable(profile).chatXP; // Calculate XP to add based on rewards table
            //    await giveXP(profile, message.guild.id, xpToAdd, client, 'Chat XP');
            //}
        });

        client.login(token);

        process.on('SIGINT', function() {
            shutdownBot('Received SIGINT, shutting down gracefully.');
        });
        
        process.on('SIGTERM', function() {
            shutdownBot('Received SIGTERM, shutting down gracefully.');
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            shutdownBot(`Unhandled Rejection at: ${promise} reason: ${reason}`);
        });
    } catch (error) {
        console.error('Startup error:', error);
        process.exit(1);
    }
}

startBot();

async function shutdownBot(reason) {
    const logger = await getLogger();
    logger.error(`Shutting down bot: ${reason}`);
    await mongoose.connection.close();
    process.exit(0);
}