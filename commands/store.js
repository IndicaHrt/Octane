const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Profile, Item } = require('../models');
const { DateTime } = require('luxon');
const { getLogger } = require('../utils/logging');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('store')
        .setDescription('Displays available items in the store, purchase with /buy command.'),
    category: 'Economy',
    async execute(interaction) {
    let logger = await getLogger();
        const profile = await Profile.findOne({ userId: interaction.user.id });
        const items = await Item.find({ enabled: true });
        if (!items || items.length === 0) {
            return interaction.reply({ content: "No items found in the store.", ephemeral: true });
        }

        const storeEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🛒 Store Items')
            .setDescription(`Your coins: ${profile.coins.toLocaleString()} <:coins:1269411594685644800>\n\nHere are the items you can buy:`);

        let itemPrice = '';
        items.forEach(item => {
            if (item.currency === 'coins' || item.currency === null) {
                itemPrice = item.value.toLocaleString() + ' <:coins:1269411594685644800>';
            } else {
                itemPrice = item.value.toLocaleString() + ' ' + item.currency;
            }
            storeEmbed.addFields({ name: `${item.name} ${item.emoji}`, value: `Price: ${itemPrice}\nDescription: ${item.description}\nTo buy: \`/buy ${item.itemId}\`` });
        });

        await interaction.reply({ embeds: [storeEmbed] });
    }
};
