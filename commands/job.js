const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const { Profile, Job } = require('../models');
const { DateTime } = require('luxon');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('job')
        .setDescription('Manage your job with various options!')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active jobs'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('apply')
                .setDescription('Apply for a job')
                .addStringOption(option => option.setName('tag').setDescription('Tag of the job you are applying for').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('view')
                .setDescription('View Job Information')
                .addStringOption(option => option.setName('tag').setDescription('Tag of the job you are searching')))
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('View your Job'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave your current job'))
    ,category : 'General',
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'apply':
                await joinJob(interaction);
                break;
            case 'leave':
                await leaveJob(interaction);
                break;
            case 'list':
                await listJob(interaction);
                break;
            case 'view':
                await jobInfo(interaction);
                break;
            case 'info':
                await showCurrentJobInfo(interaction);
                break;
            default:
                await showCurrentJobInfo(interaction);
        }
    }
};

async function showCurrentJobInfo(interaction) {
    const profile = await Profile.findOne({ userId: interaction.user.id });
    const logger = await getLogger();

    if (!profile || !profile.job) {
        await interaction.reply({ content: "You do not have a job. Use /job list to find jobs.", ephemeral: true });
        return;
    }

    const job = await Job.findById(profile.job).populate('positions');
    if (!job) {
        await interaction.reply({ content: "Job not found. It might have been removed.", ephemeral: true });
        return;
    }

    const employeeInfo = job.employees.find(e => e.userID === interaction.user.id);
    if (!employeeInfo) {
        await interaction.reply({ content: "You are not an employee of this job.", ephemeral: true });
        return;
    }

    const positionData = job.positions.find(p => p._id.toString() === employeeInfo.positionId.toString());
    if (!positionData) {
        await interaction.reply({ content: "Position data not found.", ephemeral: true });
        return;
    }

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle(`${job.name} Lvl${job.level} - Job Details` + job.emoji)
        .setDescription(`**${positionData.name}**\n**Bank:** ${job.bank.toLocaleString()} <:coins:1269411594685644800>\nHere's the current information about your job:`)
        .addFields(
            { name: 'Your XP', value: `${employeeInfo.xp.toLocaleString()}`, inline: true },
            { name: 'Coins Earned', value: `${employeeInfo.coinsEarned.toLocaleString()} <:coins:1269411594685644800>`, inline: true },
            { name: 'Pay Rate', value: `Base: ${employeeInfo.coinsPerMin} <:coins:1269411594685644800> per hour\nPosition Multi:${positionData.payMultiplier}x`, inline: true },
            { name: 'Last Worked', value: `${employeeInfo.lastWorked.toLocaleDateString()}`, inline: true }
        )
        .setFooter({ text: `Joined on: ${employeeInfo.joinDate.toLocaleDateString()}` });

    await interaction.reply({ embeds: [embed] });
}

async function joinJob(interaction) {
    const tag = interaction.options.getString('tag').toLowerCase();
    const profile = await Profile.findOne({ userId: interaction.user.id });
    if (!profile) {
        return interaction.reply({ content: "Profile not found.", ephemeral: true });
    }

    const job = await Job.findOne({ jobTag: tag });
    if (!job) {
        return interaction.reply({ content: "Job not found.", ephemeral: true });
    }

    if (profile.job) {
        return interaction.reply({ content: "You already have a job. Leave your current job before applying for a new one.", ephemeral: true });
    }

    const userJob = job.employees.find(e => e.userID === interaction.user.id);
    if (userJob) {
        await interaction.reply({ content: "You already work there.", ephemeral: true });
        return;
    }

    if (!job.enabled) {
        return interaction.reply({ content: `Job ${job.name} is not active.`, ephemeral: true });
    }

    const level = profile.level;
    if (level < job.levelRequired) {
        return interaction.reply({ content: `Your application was denied, you need to be at least level ${job.levelRequired} to apply for this job.`, ephemeral: true });
    }

    try {
        await job.addEmployee(interaction.user.id);
        profile.job = job._id;
        await profile.save();
        await interaction.reply({ content: `Congrats! You are now hired as an Employee at ${job.name}.`, ephemeral: true });
    } catch (error) {
        console.error('Error adding employee:', error);
        return interaction.reply({ content: "There was an error processing your job application.", ephemeral: true });
    }
}

async function leaveJob(interaction) {
    const profile = await Profile.findOne({ userId: interaction.user.id });
    const now = DateTime.now().setZone('America/New_York');
    const job = await Job.findOne({ _id: profile.job });
    if (!job) {
        await interaction.reply({ content: "You do not have a job.", ephemeral: true });
        return;
    }

    if (job.ownerId === interaction.user.id) {
        await interaction.reply({ content: "You cannot leave a job you own. Disband the job instead.", ephemeral: true });
        return;
    }

    const member = job.employees.find(m => m.userID === interaction.user.id);
    const joinDate = new Date(member.joinDate);
    const diff = now.diff(joinDate, 'days').days;
    if (diff < 3) {
        await interaction.reply({ content: "You must be employed for at least 3 days before you can leave.", ephemeral: true });
        return;
    }

    try {
        job.employees = job.employees.filter(m => m.userID !== interaction.user.id);
        await job.save();

        profile.job = null;
        await profile.save();
        await interaction.reply({ content: "You have left the job.", ephemeral: true });
    } catch (error) {
        await interaction.reply({ content: "An error occurred leaving the job.", ephemeral: true });
    }
}

async function jobInfo(interaction) {
    let jobId = null;
    let job = null;
    let tag = interaction.options.getString('tag');
    const profile = await Profile.findOne({ userId: interaction.user.id });
    const logger = await getLogger();
    if (!tag) {
        logger.debug(`No tag provided. Checking user profile for job | ${interaction.user.id}`);        
        jobId = profile.job;
        if (!jobId) {
            await interaction.reply({ content: "You do not have a job. Provide a Job Tag to view details of one.", ephemeral: true });
            return;
        } else {
            job = await Job.findOne({ _id: jobId });
        }
    } else {
        tag = tag.toLowerCase();
        job = await Job.findOne({ jobTag: tag });
    }

    if (!job) {
        await interaction.reply({ content: "Job not found.", ephemeral: true });
        return;
    }

    const jobImage = job.image || 'https://i.imgur.com/3GyZt2b.png';
    //logger.debug(`Profile Image Request: ${profileImg}`);
    const attachment = new AttachmentBuilder(jobImage, { name: 'job.png' });

    const emoji = job.emoji+' ' || '👷 ';
    
    let managers = '';
    const managerCount = job.employees.filter(m => m.position === 'manager').length;
    if (managerCount === 0) {
        managers = 'None';
    } else {
        managers = job.employees.filter(m => m.position === 'manager').map(m => `<@${m.userID}>`).join(', ');
    }
    try {
        //const lastWorked = job.employees.find(m => m.userID === interaction.user.id).lastWorked || job.createDate;
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(`${emoji}[${job.jobTag.toLocaleUpperCase()}]  ${job.name}`)
            .setDescription(job.description || 'New job!')
            //.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setImage('attachment://job.png')
            .addFields(
                { name: 'Level', value: `${job.level}/5`, inline: true },
                { name: 'Bank', value: `<:coins:1269411594685644800> ${job.bank.toLocaleString()}`, inline: true },
                { name: 'Public', value: job.enabled ? 'Yes' : 'No', inline: true },
                { name: 'Employees', value: `${job.employees.length}`, inline: true },
                { name: 'Managers', value: `${managers}`, inline: true },
                { name: 'Owner', value: '<@'+job.ownerId+'>', inline: true }                
            )
            .setFooter({ text: `Created: ${job.createDate.toLocaleDateString()}` });// | Last Worked: ${lastWorked.toLocaleDateString()}` });
    
        interaction.reply({ embeds: [embed], files: [attachment] });
    } catch (error) {
        logger.error(interaction.user.tag+' | job: '+error);
        interaction.reply('An error occurred while generating the job profile.', { ephemeral: true });
    }

}

async function listJob(interaction) {
    const pageLimit = 5;
    let page = 0;
    const jobs = await Job.find({ enabled: true }).sort({ levelRequired: 1 }).lean();

    function generateEmbed(start) {
        const current = jobs.slice(start, start + pageLimit);
        const embed = new EmbedBuilder()
            .setTitle('Active Jobs')
            .setDescription(current.map(job => 
                `**[${job.jobTag.toLocaleUpperCase()}]**  ${job.name}\n` +
                `┣ Level: ${job.level} - Bank: ${job.bank.toLocaleString()}\n` +
                `┣ Required Level: ${job.levelRequired} - Base Pay: ${job.basePay.toLocaleString()}\n` +
                `┣ Created: ${job.createDate.toLocaleDateString()} - Owned by <@${job.ownerId}>\n` +
                `┗ Employees: ${job.employees.length}`).join('\n\n'))
            .setFooter({ text: `Page ${page + 1} of ${Math.ceil(jobs.length / pageLimit)}` })
            .setColor(0x00AE86);

        return embed;
    }

    const embed = generateEmbed(0);
    const message = await interaction.reply({ content: '*To join a job type /job apply TAG*\n*Example:* `/job apply taco`', embeds: [embed], fetchReply: true });

    if (jobs.length <= pageLimit) return;

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder().setCustomId('previous').setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Primary)
        );

    await interaction.editReply({ embeds: [embed], components: [row] });

    const filter = i => ['previous', 'next'].includes(i.customId) && i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    collector.on('collect', async i => {
        if (i.customId === 'next' && page < Math.ceil(jobs.length / pageLimit) - 1) {
            page++;
        } else if (i.customId === 'previous' && page > 0) {
            page--;
        }

        const newEmbed = generateEmbed(page * pageLimit);
        await i.update({
            embeds: [newEmbed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('previous').setLabel('Previous').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('next').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(page === Math.ceil(jobs.length / pageLimit) - 1)
                )
            ]
        });
    });

    collector.on('end', () => interaction.editReply({ components: [] }));
}