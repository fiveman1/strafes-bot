import { mkdirSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { WR } from "../api.js";

// Every WR the bot has seen on the site's WR list, and what it did with it, so nothing is posted twice (even across
// restarts), and the messages it posted for each.

/**
 * baseline: on the list the first time the bot ever looked, so not new. posted: announced. skipped: didn't count (the
 * reason says why).
 */
export type WRStatus = "baseline" | "posted" | "skipped";

export interface StoredWR {
    timeId: string
    time: number
    mapId: number
    game: number
    style: number
    course: number
    userId: number
    username: string
    /** When it was set */
    date: string
    status: WRStatus
    reason: string | null
}

const MIGRATIONS = [
    `CREATE TABLE wrs (
        time_id TEXT NOT NULL,
        time INTEGER NOT NULL,
        map_id INTEGER NOT NULL,
        game INTEGER NOT NULL,
        style INTEGER NOT NULL,
        course INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        date TEXT NOT NULL,
        seen_at TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT,
        PRIMARY KEY (time_id, time)
    );
    CREATE INDEX wrs_by_map ON wrs (map_id, game, style, course, date);
    CREATE TABLE wr_messages (
        time_id TEXT NOT NULL,
        time INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        posted_at TEXT NOT NULL,
        PRIMARY KEY (channel_id, message_id),
        FOREIGN KEY (time_id, time) REFERENCES wrs (time_id, time)
    );
    CREATE INDEX wr_messages_by_wr ON wr_messages (time_id, time);`
];

interface Row {
    time_id: string
    time: number
    map_id: number
    game: number
    style: number
    course: number
    user_id: number
    username: string
    date: string
    status: WRStatus
    reason: string | null
}

function fromRow(row: Row | undefined): StoredWR | undefined {
    return row && {
        timeId: row.time_id,
        time: row.time,
        mapId: row.map_id,
        game: row.game,
        style: row.style,
        course: row.course,
        userId: row.user_id,
        username: row.username,
        date: row.date,
        status: row.status,
        reason: row.reason
    };
}

export class GlobalsStore {
    private readonly db: DatabaseSync;

    constructor(file: string) {
        mkdirSync(path.dirname(file), { recursive: true });
        this.db = new DatabaseSync(file);
        this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
        this.migrate();
    }

    private migrate() {
        const { user_version: version } = this.db.prepare("PRAGMA user_version").get() as { user_version: number };
        for (let i = version; i < MIGRATIONS.length; ++i) {
            this.transaction(() => {
                this.db.exec(MIGRATIONS[i]);
                this.db.exec(`PRAGMA user_version = ${i + 1}`);
            });
        }
    }

    private transaction(fn: () => void) {
        this.db.exec("BEGIN");
        try {
            fn();
            this.db.exec("COMMIT");
        }
        catch (err) {
            this.db.exec("ROLLBACK");
            throw err;
        }
    }

    /** True until it's seen the WR list once */
    isEmpty() {
        return this.db.prepare("SELECT 1 FROM wrs LIMIT 1").get() === undefined;
    }

    has(wr: WR) {
        return this.db.prepare("SELECT 1 FROM wrs WHERE time_id = ? AND time = ?").get(wr.id, wr.time) !== undefined;
    }

    /** The most recently set WR it's seen on this WR's map (same game, style and course), whatever it did with it */
    latestOnMap(wr: WR) {
        return fromRow(this.db.prepare(`SELECT * FROM wrs WHERE map_id = ? AND game = ? AND style = ? AND course = ?
            ORDER BY date DESC LIMIT 1`).get(wr.map.id, wr.game_id, wr.style_id, wr.course) as Row | undefined);
    }

    /** The WR this one replaced, if it's the same player beating their own WR (which keeps the time's ID) */
    previousTime(wr: WR) {
        return fromRow(this.db.prepare("SELECT * FROM wrs WHERE time_id = ? AND time > ? ORDER BY date DESC LIMIT 1")
            .get(wr.id, wr.time) as Row | undefined);
    }

    add(wr: WR, status: WRStatus, reason?: string) {
        this.db.prepare(`INSERT OR IGNORE INTO wrs (time_id, time, map_id, game, style, course, user_id, username, date, seen_at, status, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
            wr.id, wr.time, wr.map.id, wr.game_id, wr.style_id, wr.course, wr.user.id, wr.user.username,
            new Date(wr.date).toISOString(), new Date().toISOString(), status, reason ?? null
        );
    }

    addBaseline(wrs: WR[]) {
        this.transaction(() => {
            for (const wr of wrs) {
                this.add(wr, "baseline");
            }
        });
    }

    addMessage(wr: WR, channelId: string, messageId: string) {
        this.db.prepare("INSERT OR IGNORE INTO wr_messages (time_id, time, channel_id, message_id, posted_at) VALUES (?, ?, ?, ?, ?)")
            .run(wr.id, wr.time, channelId, messageId, new Date().toISOString());
    }

    close() {
        this.db.close();
    }
}
