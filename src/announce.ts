import { Client, EmbedBuilder, GuildMember, MessageFlags, User } from "discord.js";
import { robloxProfileUrl, strafesUserUrl } from "./api.js";
import { config } from "./config.js";

// Messages the bot posts in channels (as opposed to replies): the welcome when someone is verified, and the log of
// verifications. Both are optional, and failing to post never stops the rest of verifying.

const COLOR = 0xee4b93;

async function sendableChannel(client: Client, channelId: string | undefined) {
    if (!channelId) {
        return undefined;
    }
    try {
        const channel = await client.channels.fetch(channelId);
        if (channel?.isSendable()) {
            return channel;
        }
        console.error(`Channel ${channelId} isn't one the bot can post in`);
    }
    catch (err) {
        console.error(`Couldn't find channel ${channelId}:`, err);
    }
    return undefined;
}

/** In WELCOME_CHANNEL_ID, if it's in this member's server */
export async function postWelcome(member: GuildMember, roblox: { robloxId: number, robloxUsername: string | undefined, headshotUrl: string | undefined }) {
    const channel = await sendableChannel(member.client, config.welcomeChannelId);
    if (!channel || !("guild" in channel) || channel.guild.id !== member.guild.id) {
        return;
    }

    const { robloxId, robloxUsername, headshotUrl } = roblox;
    // The title is the Roblox name, so with SET_NICKNAMES (where the mention shows the same name) it doesn't say it twice
    const embed = new EmbedBuilder()
        .setAuthor({ name: member.guild.name, iconURL: member.guild.iconURL() ?? undefined })
        .setTitle(`Welcome, ${robloxUsername ?? member.displayName}!`)
        .setURL(strafesUserUrl(robloxId))
        .setDescription(`Say hi to ${member}!\n\n[Roblox profile](${robloxProfileUrl(robloxId)})`)
        .setThumbnail(headshotUrl ?? member.displayAvatarURL())
        .setColor(COLOR);
    try {
        // Mentions in embeds don't come with the user's data, so a client that hasn't loaded the member yet (likely, since
        // they're usually new) shows the embed's mention as unknown. A mention that pings, in the content, does come with it.
        await channel.send({ content: `${member}`, embeds: [embed], allowedMentions: { users: [member.id] } });
    }
    catch (err) {
        console.error(`Couldn't post the welcome for ${member.id}:`, err);
    }
}

export interface Verification {
    discordId: string
    /** For their name and avatar, if Discord could give them */
    user: User | undefined
    robloxId: number
    robloxUsername: string | undefined
    headshotUrl: string | undefined
    /** What the Discord account was linked to before, when it was a different account */
    previous?: { robloxId: number, robloxUsername: string | undefined }
    /** linked: through the site. role: already linked, and /verify gave them the role. */
    how: "linked" | "role"
    /** Servers where they got the verified role, and ones where they should have but the bot couldn't give it */
    roleGivenIn: string[]
    roleFailedIn: string[]
}

function robloxAccount(robloxId: number, username: string | undefined) {
    return `[${username ?? "Unknown"}](${robloxProfileUrl(robloxId)}) (\`${robloxId}\`)`;
}

/** In LOG_CHANNEL_ID */
export async function postVerificationLog(client: Client, verification: Verification) {
    const channel = await sendableChannel(client, config.logChannelId);
    if (!channel) {
        return;
    }

    const { discordId, user, robloxId, robloxUsername, headshotUrl, previous, how, roleGivenIn, roleFailedIn } = verification;
    const embed = new EmbedBuilder()
        .setTitle(how === "linked" ? (previous ? "Changed linked account" : "Linked") : roleFailedIn.length > 0 ? "Couldn't give the verified role" : "Given the verified role")
        .addFields(
            { name: "Discord", value: `<@${discordId}> (\`${discordId}\`)`, inline: true },
            { name: "Roblox", value: robloxAccount(robloxId, robloxUsername), inline: true }
        )
        .setColor(roleFailedIn.length > 0 ? 0xe8a33d : COLOR)
        .setTimestamp();
    if (user) {
        embed.setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });
    }
    if (headshotUrl) {
        embed.setThumbnail(headshotUrl);
    }
    if (previous) {
        embed.addFields({ name: "Previously", value: robloxAccount(previous.robloxId, previous.robloxUsername) });
    }
    if (how === "role") {
        embed.setDescription("They were already linked, and used /verify to get the role.");
    }

    const role = config.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : undefined;
    if (role && roleGivenIn.length + roleFailedIn.length > 0) {
        const lines = [
            ...roleGivenIn.map((name) => `✅ Given ${role} in ${name}`),
            ...roleFailedIn.map((name) => `⚠️ Couldn't give ${role} in ${name} (check the bot's role and permissions)`)
        ];
        embed.addFields({ name: "Role", value: lines.join("\n") });
    }

    try {
        // Like the welcome, a real mention in the content so the embed's mention shows their name, but silent. They're
        // the only one it can mention, and in a channel they can't see (as a log channel usually is) it doesn't reach them.
        await channel.send({
            content: `<@${discordId}>`,
            embeds: [embed],
            allowedMentions: { users: [discordId] },
            flags: MessageFlags.SuppressNotifications
        });
    }
    catch (err) {
        console.error(`Couldn't post the verification log for ${discordId}:`, err);
    }
}
