import { Client, Message } from "discord.js";
import { sendableChannel } from "../announce.js";
import { StrafesApi, WR } from "../api.js";
import { getMapTop } from "../strafesNet.js";
import { AUTOHOP, describe, Game, PreviousWR, wrMessage } from "./embed.js";
import { GlobalsStore } from "./store.js";

// Globals: announces new WRs. Every 30 seconds it gets the site's list of WRs (most recently set first) and posts the 
// ones it hasn't seen before that count:
// - Set in the last 2 hours. The site can find a WR late, and when a WR is deleted (or its player blacklisted) the
//   one before it is back on the list, as if new. Most of those are old.
// - Not older than a WR it's already seen on that map. That's also one that's back because the newer one was
//   deleted, but recently set.
// - #1 on leaderboard for the map, which excludes blacklisted players.
// A WR is its time ID and time together, since the same player beating their own WR keeps the ID. The first time it
// ever runs, it takes what's on the list as already announced.

const POLL_MS = 30_000;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface GlobalsChannels {
    /** Every WR */
    all?: string
    bhopAuto?: string
    bhopStyles?: string
    surfAuto?: string
    surfStyles?: string
}

interface Announcement {
    wr: WR
    previous: PreviousWR | undefined
}

type Verdict = { post: true, previous: PreviousWR | undefined } | { post: false, reason: string };

export class Globals {
    private timer: NodeJS.Timeout | undefined;
    private failing = false;

    constructor(
        private readonly client: Client<true>,
        private readonly api: StrafesApi,
        private readonly store: GlobalsStore,
        private readonly strafesNetKey: string,
        private readonly channels: GlobalsChannels
    ) {
    }

    start() {
        const loop = async () => {
            await this.poll();
            this.timer = setTimeout(loop, POLL_MS);
        };
        void loop();
    }

    stop() {
        clearTimeout(this.timer);
    }

    private async poll() {
        try {
            const announcements = await this.findNew();
            this.recovered();
            if (announcements.length > 0) {
                await this.post(announcements);
            }
        }
        catch (err) {
            // Logged once per outage, not every 30 seconds
            if (!this.failing) {
                console.error("Couldn't check for new WRs (trying again every 30 seconds):", err instanceof Error ? err.message : err);
                this.failing = true;
            }
        }
    }

    private recovered() {
        if (this.failing) {
            console.log("Checking for new WRs again");
            this.failing = false;
        }
    }

    private async findNew() {
        const page = await this.api.getWRs(1);
        // There's no fly trials channel
        const wrs = page.data.filter((wr) => wr.game_id === Game.bhop || wr.game_id === Game.surf);

        if (this.store.isEmpty()) {
            this.store.addBaseline(wrs);
            console.log(`Globals: first run, took the ${wrs.length} WRs on the list as already announced`);
            return [];
        }

        // Oldest first, so the posts are in order, and so an older WR on a map is checked before a newer one
        const unseen = wrs.filter((wr) => !this.store.has(wr)).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
        const announcements: Announcement[] = [];
        for (const wr of unseen) {
            // If StrafesNET can't say, it stops here: the ones decided on are posted, and the rest are checked again next time
            let verdict: Verdict;
            try {
                verdict = await this.check(wr);
            }
            catch (err) {
                if (announcements.length > 0) {
                    await this.post(announcements);
                }
                throw err;
            }

            if (verdict.post) {
                // Stored before it's posted, so a crash partway can't post it again
                this.store.add(wr, "posted");
                announcements.push({ wr, previous: verdict.previous });
                console.log(`New WR: ${describe(wr)}`);
            }
            else {
                this.store.add(wr, "skipped", verdict.reason);
                console.log(`Not announcing ${describe(wr)}: ${verdict.reason}`);
            }
        }
        return announcements;
    }

    private async check(wr: WR): Promise<Verdict> {
        if (Date.now() - Date.parse(wr.date) > MAX_AGE_MS) {
            return { post: false, reason: "set over 2 hours ago" };
        }

        const latest = this.store.latestOnMap(wr);
        if (latest && Date.parse(latest.date) > Date.parse(wr.date)) {
            return { post: false, reason: `older than ${latest.username}'s WR from ${latest.date} (deleted or blacklisted?)` };
        }

        // More than the 2 it needs, since now and then StrafesNET lists the same time more than once
        const top = await getMapTop(this.strafesNetKey, { mapId: wr.map.id, game: wr.game_id, style: wr.style_id, course: wr.course }, 20);
        const first = top[0];
        if (!first || first.id !== wr.id || first.time !== wr.time) {
            return { post: false, reason: "not #1 on StrafesNET's leaderboard (deleted, blacklisted, or already beaten)" };
        }

        // The player beating their own WR: StrafesNET only has their new time
        const own = this.store.previousTime(wr);
        if (own) {
            return { post: true, previous: { time: own.time, username: own.username } };
        }
        const second = top.find((time) => time.id !== first.id);
        return { post: true, previous: second ? { time: second.time, username: second.user.username } : undefined };
    }

    private channelsFor(wr: WR) {
        const autohop = wr.style_id === AUTOHOP;
        const own = wr.game_id === Game.bhop
            ? (autohop ? this.channels.bhopAuto : this.channels.bhopStyles)
            : (autohop ? this.channels.surfAuto : this.channels.surfStyles);
        return [this.channels.all, own].filter((id): id is string => id !== undefined);
    }

    private async post(announcements: Announcement[]) {
        const byChannel = new Map<string, Announcement[]>();
        for (const announcement of announcements) {
            for (const channelId of this.channelsFor(announcement.wr)) {
                byChannel.set(channelId, [...(byChannel.get(channelId) ?? []), announcement]);
            }
        }

        // Channels at the same time, each one in order
        await Promise.all([...byChannel].map(async ([channelId, list]) => {
            const channel = await sendableChannel(this.client, channelId);
            if (!channel) {
                return;
            }
            for (const { wr, previous } of list) {
                let message: Message;
                try {
                    message = await channel.send(wrMessage(wr, previous));
                }
                catch (err) {
                    console.error(`Couldn't post ${describe(wr)} in ${channelId}:`, err);
                    continue;
                }
                this.store.addMessage(wr, channelId, message.id);
                crosspost(message);
            }
        }));
    }
}

/**
 * In an announcement channel, publishes it to the servers following it. Not waited on: Discord allows 10 an hour per
 * channel, and past that it fails right away (see the client's rejectOnRateLimit) rather than holding the rest up.
 */
function crosspost(message: Message) {
    if (!message.crosspostable) {
        return;
    }
    message.crosspost().catch((err) => {
        console.warn(`Couldn't publish message ${message.id} in ${message.channelId}:`, err instanceof Error ? err.message : err);
    });
}
