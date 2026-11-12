import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, InteractionContextType, MessageFlags, RepliableInteraction, SlashCommandBuilder } from "discord.js";
import { postVerificationLog, postWelcome } from "../announce.js";
import { getRobloxHeadshotUrl, getRobloxUsername, StrafesApi } from "../api.js";
import { addPendingLink } from "../pending.js";
import { giveVerifiedRole, setMemberNickname, verifiedRoleIn } from "../roles.js";
import { Command } from "./types.js";

/** The custom ID of the verify panel's button (see panel.ts), which does the same as /verify */
export const VERIFY_BUTTON_ID = "verify";

/** /verify, and the verify panel's button */
export async function runVerify(interaction: RepliableInteraction, api: StrafesApi) {
    // Ephemeral, so the link is only ever shown to whoever it's for: anyone who opens it can link their Roblox
    // account to this Discord account
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = interaction.user;
    const current = await api.getLink(user.id);
    const currentUsername = current ? await getRobloxUsername(current.robloxId) : undefined;
    const currentName = currentUsername ?? String(current?.robloxId);

    // Already linked but missing the role (they linked before joining, or a moderator took it away): that's what
    // they're after, so just give it. Running /verify again once they have it is how to link a different account.
    const member = interaction.inCachedGuild() ? interaction.member : undefined;
    const role = member ? verifiedRoleIn(member.guild) : undefined;
    if (current && member && role && !member.roles.cache.has(role.id)) {
        const given = await giveVerifiedRole(member, role);
        await setMemberNickname(member, currentUsername);
        await interaction.editReply({
            content: given
                ? `✅ You're linked to **${currentName}**, so you've been given ${role}. To link a different Roblox account, verify again.`
                : `You're linked to **${currentName}**, but I couldn't give you ${role}. Ask a moderator to check my role and permissions.`,
            allowedMentions: { parse: [] }
        });

        const headshotUrl = await getRobloxHeadshotUrl(current.robloxId);
        if (given) {
            await postWelcome(member, { robloxId: current.robloxId, robloxUsername: currentUsername, headshotUrl });
        }
        await postVerificationLog(interaction.client, {
            discordId: user.id,
            user: user,
            robloxId: current.robloxId,
            robloxUsername: currentUsername,
            headshotUrl: headshotUrl,
            how: "role",
            roleGivenIn: given ? [member.guild.name] : [],
            roleFailedIn: given ? [] : [member.guild.name]
        });
        return;
    }

    const request = await api.createLinkRequest(user.id, user.username, user.displayAvatarURL({ extension: "png", size: 128 }));

    let description = "Open the link below, log in with Roblox, and confirm. The link expires after 15 minutes.\n\n"
        + "**Don't share this link.** Whoever opens it can link their Roblox account to your Discord account.";
    if (current) {
        description = `You're linked to **${currentName}** now. Linking again replaces that.\n\n` + description;
    }

    const expiresAt = Math.floor(Date.parse(request.expiresAt) / 1000);
    const embed = new EmbedBuilder()
        .setTitle("Link your Roblox account")
        .setDescription(description + `\n\nExpires <t:${expiresAt}:R>.`)
        .setColor(0xee4b93);
    const button = new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setLabel("Link with Roblox")
        .setURL(request.url);

    await interaction.editReply({
        embeds: [embed],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)]
    });
    addPendingLink(request.id, interaction, request.expiresAt);
}

export const verify: Command = {
    data: new SlashCommandBuilder()
        .setName("verify")
        .setDescription("Link your Roblox account to your Discord account")
        .setContexts(InteractionContextType.Guild),

    execute: runVerify
};
