import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageCreateOptions } from "discord.js";
import { SITE_URL, strafesUserUrl, WR } from "../api.js";

export const Game = { bhop: 1, surf: 2 } as const;
export const AUTOHOP = 1;

const GAME_NAMES: Record<number, string> = { 1: "bhop", 2: "surf", 5: "fly trials" };
const STYLE_NAMES: Record<number, string> = {
    1: "autohop",
    2: "scroll",
    3: "sideways",
    4: "half-sideways",
    5: "w-only",
    6: "a-only",
    7: "backwards",
    8: "faste",
    14: "low gravity",
    18: "boost"
};

const MAIN_COURSE = 0;

/** Like the site: main, bonus 1, bonus 2... or short, b1, b2... */
export function formatCourse(course: number, short?: boolean) {
    if (course === MAIN_COURSE) {
        return "main";
    }
    return short ? `b${course}` : `bonus ${course}`;
}

export interface PreviousWR {
    time: number
    username: string
}

function pad(value: number, length: number) {
    return String(value).padStart(length, "0");
}

/** The same as the site's: 01:23.456, 01:02:03 past an hour (no milliseconds), and ~2 days past a day */
export function formatTime(ms: number) {
    const sign = ms < 0 ? "-" : "";
    ms = Math.abs(ms);
    if (ms >= 86_400_000) {
        const days = Math.floor(ms / 86_400_000);
        if (days > 999) {
            return ">999 days";
        }
        return days === 1 ? "~1 day" : `~${days} days`;
    }
    const millis = pad(ms % 1000, 3);
    const seconds = pad(Math.floor(ms / 1000) % 60, 2);
    const minutes = pad(Math.floor(ms / 60_000) % 60, 2);
    const hours = Math.floor(ms / 3_600_000) % 24;
    if (hours === 0) {
        return `${sign}${minutes}:${seconds}.${millis}`;
    }
    return `${sign}${pad(hours, 2)}:${minutes}:${seconds}`;
}

/** The same as the site's, for how far apart two times are (ms >= 0): 0.754s, 1m 15s, or 1h 2m */
export function formatDiff(ms: number) {
    const diff = ms / 1000;
    if (diff < 60) {
        return `${diff.toFixed(3)}s`;
    }
    // Rounded before it's split up, so 59m 59.6s is 1h 0m rather than 60m 0s
    const seconds = Math.round(diff);
    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    }
    const minutes = Math.round(diff / 60);
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** How much faster (or slower) a time is, signed like the site: -0.754s */
function formatSignedDiff(ms: number) {
    return (ms > 0 ? "+" : ms < 0 ? "-" : "") + formatDiff(Math.abs(ms));
}

export function mapName(wr: WR) {
    // Some map names have hair spaces in them, which Discord shows as nothing
    return wr.map.display_name.replaceAll("\u200a", " ");
}

/** The map's name, with the course if it's a bonus, like the site does: Vibrant Forest (b5) */
function mapWithCourse(wr: WR) {
    return mapName(wr) + (wr.course !== MAIN_COURSE ? ` (${formatCourse(wr.course, true)})` : "");
}

export function describe(wr: WR) {
    return `${mapWithCourse(wr)} (${GAME_NAMES[wr.game_id] ?? wr.game_id} ${STYLE_NAMES[wr.style_id] ?? wr.style_id}) ${formatTime(wr.time)} by ${wr.user.username}`;
}

export function replayUrl(wr: WR) {
    return `${SITE_URL}/replays/${wr.id}`;
}

export function wrMessage(wr: WR, previous: PreviousWR | undefined): MessageCreateOptions {
    const query = `game=${wr.game_id}&style=${wr.style_id}`;
    // The map page shows the main course without one
    const mapQuery = query + (wr.course !== MAIN_COURSE ? `&course=${wr.course}` : "");
    const tier = wr.map.tier ? String(wr.map.tier) : "n/a";
    const date = Math.floor(Date.parse(wr.date) / 1000);

    const embed = new EmbedBuilder()
        .setAuthor({ name: "New WR", iconURL: "https://i.imgur.com/PtLyW2j.png" })
        .setTitle(`\u{1F451}  ${mapWithCourse(wr)}`)
        .setURL(`${SITE_URL}/maps/${wr.map.id}?${mapQuery}`)
        .addFields(
            { name: "Player", value: `[${wr.user.username}](${strafesUserUrl(wr.user.id, wr.game_id, wr.style_id)})`, inline: true },
            { name: "Time", value: formatTime(wr.time) + (previous ? ` (${formatSignedDiff(wr.time - previous.time)})` : ""), inline: true }
        )
        .setColor(0x80ff80)
        .setFooter({ text: "World Record" });

    embed.addFields({
        name: "Info",
        value: [
            `**Game:** ${GAME_NAMES[wr.game_id] ?? "unknown"}`,
            `**Style:** ${STYLE_NAMES[wr.style_id] ?? "unknown"}`,
            `**Course:** ${formatCourse(wr.course)}`,
            `**Tier:** ${tier}`,
            `**Date:** <t:${date}:f>`,
            `**Previous WR:** ${previous ? `${formatTime(previous.time)} (${previous.username})` : "n/a"}`
        ].join("\n")
    });
    if (wr.user.thumbnail) {
        embed.setThumbnail(wr.user.thumbnail);
    }
    if (wr.map.thumbnail) {
        embed.setImage(wr.map.thumbnail);
    }

    const message: MessageCreateOptions = { embeds: [embed] };
    // Only runs with a bot have a replay page
    if (wr.has_bot) {
        message.components = [new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Watch").setEmoji("▶️").setURL(replayUrl(wr)),
            // The replay page scrolls to the comments for this
            new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Comment").setEmoji("\u{1F4AC}").setURL(`${replayUrl(wr)}?comments`)
        )];
    }
    return message;
}
