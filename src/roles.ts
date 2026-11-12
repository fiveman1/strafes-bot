import { Client, DiscordAPIError, Guild, GuildMember, RESTJSONErrorCodes, Role } from "discord.js";
import { config } from "./config.js";

// What being linked does in a server: the verified role (VERIFIED_ROLE_ID), and with SET_NICKNAMES, a nickname that's
// their Roblox username. Only in servers that have the verified role, which are the ones the bot is managing.
// Unlinking doesn't take the role away: it's there to show they verified a real account once, and they did. So people
// can unlink if they'd rather not stay linked.

/** VERIFIED_ROLE_ID, if it's set and the role is in this server */
export function verifiedRoleIn(guild: Guild): Role | undefined {
    return config.verifiedRoleId ? guild.roles.cache.get(config.verifiedRoleId) : undefined;
}

/** False if Discord wouldn't let it, which is logged */
export async function giveVerifiedRole(member: GuildMember, role: Role) {
    try {
        await member.roles.add(role, "Linked their Roblox account");
        return true;
    }
    catch (err) {
        // Most likely the bot's role is below the verified role, or it's missing Manage Roles
        console.error(`Couldn't give the verified role to ${member.id} in ${member.guild.name}:`, err);
        return false;
    }
}

/**
 * With SET_NICKNAMES: linked, their nickname becomes their Roblox username. Unlinked (robloxUsername null), it's
 * cleared, but only if it's still the username they were linked with, so a nickname they picked themselves stays.
 * Nothing happens if the username isn't known (Roblox didn't say).
 */
export async function setMemberNickname(member: GuildMember, robloxUsername: string | null | undefined, previousUsername?: string) {
    if (!config.setNicknames || robloxUsername === undefined) {
        return;
    }
    const nickname = robloxUsername ?? (member.nickname === previousUsername ? null : member.nickname);
    if (nickname === member.nickname) {
        return;
    }
    // Bots can't rename the server owner, or anyone whose highest role is at or above theirs
    if (!member.manageable) {
        console.warn(`Can't change ${member.user.username}'s nickname in ${member.guild.name}: they're the owner, or their role is above the bot's`);
        return;
    }
    try {
        await member.setNickname(nickname, robloxUsername ? "Their linked Roblox account" : "Unlinked their Roblox account");
    }
    catch (err) {
        // Most likely missing Manage Nicknames
        console.error(`Couldn't change ${member.user.username}'s nickname in ${member.guild.name}:`, err);
    }
}

export interface SyncResult {
    /** Members it gave the role to. Ones who already had it are left out. */
    changed: GuildMember[]
    /** Servers it couldn't give the role in */
    failed: Guild[]
}

/**
 * Updates the role and nickname of whoever this Discord account is, in every server with the verified role. Role IDs
 * are unique across Discord, so this works without knowing which server it started in (like after a restart).
 * robloxUsername: what they're linked to now (undefined if Roblox didn't say), or null when they unlinked, which only
 * changes the nickname.
 */
export async function syncLinkedMember(client: Client, discordId: string, robloxUsername: string | null | undefined, previousUsername?: string): Promise<SyncResult> {
    const result: SyncResult = { changed: [], failed: [] };
    for (const guild of client.guilds.cache.values()) {
        const role = verifiedRoleIn(guild);
        if (!role) {
            continue;
        }

        let member: GuildMember;
        try {
            member = await guild.members.fetch(discordId);
        }
        catch (err) {
            // Not in that server
            if (err instanceof DiscordAPIError && err.code === RESTJSONErrorCodes.UnknownMember) {
                continue;
            }
            console.error(`Couldn't look up ${discordId} in ${guild.name}:`, err);
            result.failed.push(guild);
            continue;
        }

        if (robloxUsername !== null && !member.roles.cache.has(role.id)) {
            if (await giveVerifiedRole(member, role)) {
                result.changed.push(member);
            }
            else {
                result.failed.push(guild);
            }
        }
        await setMemberNickname(member, robloxUsername, previousUsername);
    }
    return result;
}
