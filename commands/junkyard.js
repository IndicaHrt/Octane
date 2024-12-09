const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, AttachmentBuilder } = require('discord.js');
const { Profile } = require('../models');
const { DateTime } = require('luxon');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('junkyard')
        .setDescription('Spend a pass to search the junkyard for parts.')
        .addIntegerOption(option => option.setName('count').setDescription('Number of visits').setMinValue(1).setMaxValue(10).setRequired(false)),
    category: 'Rewards',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        const now = DateTime.now().setZone('America/New_York');
        const count = interaction.options.getInteger('count') || 1;
        if (profile.junkyardPasses < count) {
            return interaction.reply(`You need ${count} Junkyard Pass(es) to visit this many times.`, { ephemeral: true });
        }


        let allLoot = [];        
        for (let i = 0; i < count; i++) {
            allLoot = allLoot.concat(await generateLoot(profile));
        }
        
        const lootAggregate = allLoot.reduce((acc, item) => {
            const key = `${item.name} - ${item.condition}`;
            if (!acc[key]) {
                acc[key] = { name: item.name, condition: item.condition, value: item.value, qty: 1 };
            } else {
                acc[key].value += item.value;
                acc[key].qty += 1;
            }
            return acc;
        }, {});
        
        const finalLoot = Object.values(lootAggregate);
        //logger.debug(`Final Loot: ${JSON.stringify(finalLoot)}`);
        finalLoot.forEach(item => {
            profile.inventory.push({ name: item.name, condition: item.condition, value: item.value, category: 'Part' });
        });

        profile.junkyardPasses -= count;
        profile.junkyardVisits += count;
        profile.lastJunkyardVisit = now.toJSDate();
        await profile.save();

        try {
            const junkyardImg = await randomJunkyardImg();
            //logger.debug(`Junkyard Image: ${junkyardImg}`);
            const embed = new EmbedBuilder()
                .setTitle("Junkyard Loot")
                .setDescription(`Visit Passes used: ${count}\n*Broken, Damaged, and Worn parts cannot be used. Use /scrap to get coins for these parts.*\n*Usable parts can be equipped using /upgrade [part name]*\n\nHere's the parts you found:`)
                .setImage(junkyardImg)
                .setColor('#efc58f')
                .setFooter({ text: `You have ${profile.junkyardPasses} junkyard pass(es) left.`});
            
            finalLoot.forEach(item => {
                embed.addFields({
                    name: `${item.name} - ${item.condition}`,
                    value: `Quantity: ${item.qty}\nValue: ${item.value.toLocaleString()} <:coins:1269411594685644800>`,
                    inline: true
                });
            });

            const components = [
                new ActionRowBuilder()
                    .addComponents(new ButtonBuilder().setCustomId('execute_inventory').setLabel('View Inventory').setStyle(ButtonStyle.Primary))
            ];
    
            await interaction.reply({ embeds: [embed], components: components });
        } catch (error) {
            logger.error(interaction.user.tag+' | junkyard: '+error);
            await interaction.reply({ content: "An error occurred while visiting the junkyard.", ephemeral: true });
        }
        
    }
};

async function generateLoot(profile) {
    const parts = ["Turbo", "Supercharger", "Coilovers", "Suspension", "Exhaust", "Intake", "Intercooler", "Wheels", "Tires", "Brakes", "Nitrous", "Weight Reduction", "Aero", "Engine", "Transmission"];
    const conditions = ["Worn", "Broken", "Damaged", "Usable"];
    let conditionProbability = [0.5, 0.3, 0.2, 0.01];
    if (profile.stats.luck > 0) {
        conditionProbability[3] += profile.stats.luck * 0.10;
    }

    console.log(`Luck: ${profile.stats.luck}, Condition Probability: ${conditionProbability}`);

    let loot = [];
    for (let i = 0; i < 5; i++) {
        const part = parts[Math.floor(Math.random() * parts.length)];
        const conditionIndex = Math.random();
        let condition = conditions.find((_, index) => conditionProbability.slice(0, index + 1).reduce((a, b) => a + b, 0) > conditionIndex);
        const value = calculatePartValue(part, condition);

        loot.push({ name: part, condition: condition, value: value });
    }
    return loot;
}

function calculatePartValue(part, condition) {
    const baseValue = { "Turbo": 800, "Supercharger": 600, "Suspension": 450, "Coilovers": 300, "Exhaust": 300, "Intake": 150, "Intercooler": 400, "Wheels": 200, "Tires": 150, "Brakes": 150, "Nitrous": 500, "Weight Reduction": 200, "Aero": 300, "Engine": 1000, "Transmission": 500 };
    const conditionModifier = { "Worn": 0.05, "Broken": 0.1, "Damaged": 0.25, "Usable": 1 };
    return Math.round(baseValue[part] * conditionModifier[condition]);
}

async function randomJunkyardImg() {
    const images = [
        'https://cdn.discordapp.com/attachments/1273483771550634055/1273488461462110228/junk01.jpg?ex=66becc0d&is=66bd7a8d&hm=633fc0303ac41614adfb4b21401716d64b669ad176e9de07a78f44a8a1d1da1e&',
        'https://cdn.discordapp.com/attachments/1273483771550634055/1273488461743259742/junk02.jpg?ex=66becc0d&is=66bd7a8d&hm=ecd71191a216ab54565da1cf28c5f4c32fe642b06f422e873a153be68284cd21&',
        'https://cdn.discordapp.com/attachments/1273483771550634055/1273488462070157312/junk03.jpg?ex=66becc0d&is=66bd7a8d&hm=33b12ec138ddcb2acbfc69c6d5ae9e195681bac51bab2389113a150d0905f4f9&',
        'https://cdn.discordapp.com/attachments/1273483771550634055/1273488462389182506/junk04.jpg?ex=66becc0d&is=66bd7a8d&hm=5c8cdbd36065aed69cda9d6197319ef0ed52f8932f1b5d04796f696a24c668dc&',
        'https://cdn.discordapp.com/attachments/1273483771550634055/1273488462707818578/junk05.jpg?ex=66becc0d&is=66bd7a8d&hm=fb1d43989b36f47bc6ed755e1256690dc8400f71df4374bc5526f34e3e98a56a&',
        'https://cdn.discordapp.com/attachments/1273483771550634055/1273488463047561216/junk06.jpg?ex=66becc0d&is=66bd7a8d&hm=591439bdb42a80d4fa2b52e25c82d20ede65c40bd9b7e9dee47af8470419cab6&'
    ];
    return images[Math.floor(Math.random() * images.length)];
}
