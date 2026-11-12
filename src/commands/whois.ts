import { EmbedBuilder, InteractionContextType, SlashCommandBuilder } from "discord.js";
import { getRobloxHeadshotUrl, getRobloxUsername, robloxProfileUrl, strafesUserUrl } from "../api.js";
import { Command } from "./types.js";

export const whois: Command = {
    data: new SlashCommandBuilder()
        .setName("whois")
        .setDescription("See which Roblox account someone has linked")
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) => option
            .setName("user")
            .setDescription("Who to look up (you, if left out)")),

    async execute(interaction, api) {
        // Public: who's linked to what is public anyway (the API's Discord -> Roblox lookup is)
        await interaction.deferReply();

        const target = interaction.options.getUser("user") ?? interaction.user;
        const self = target.id === interaction.user.id;
        const link = await api.getLink(target.id);
        if (!link) {
            await interaction.editReply({
                content: self ? "You don't have a Roblox account linked. Use \`/verify\` to link one." : `${target} doesn't have a Roblox account linked.`,
                // Mentions them by name without pinging them
                allowedMentions: { parse: [] }
            });
            return;
        }

        const [username, headshotUrl] = await Promise.all([getRobloxUsername(link.robloxId), getRobloxHeadshotUrl(link.robloxId)]);
        const embed = new EmbedBuilder()
            .setAuthor({ name: target.username, iconURL: target.displayAvatarURL() })
            .setTitle(username ?? `Roblox user ${link.robloxId}`)
            .setURL(strafesUserUrl(link.robloxId))
            .addFields(
                { name: "Roblox ID", value: String(link.robloxId), inline: true },
                { name: "Roblox", value: `[Profile](${robloxProfileUrl(link.robloxId)})`, inline: true }
            )
            .setColor(0xee4b93);
        if (headshotUrl) {
            embed.setThumbnail(headshotUrl);
        }
        if (link.linkedAt) {
            embed.setFooter({ text: "Linked" }).setTimestamp(new Date(link.linkedAt));
        }
        await interaction.editReply({ embeds: [embed] });
    }
};
