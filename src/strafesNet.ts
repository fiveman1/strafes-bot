// The StrafesNET API

const BASE_URL = "https://api.strafes.net/api/v1";

export interface StrafesNetTime {
    id: string
    /** Milliseconds */
    time: number
    date: string
    has_bot: boolean
    game_id: number
    mode_id: number
    style_id: number
    user: { id: number, username: string, state_id: number, muted: boolean }
}

export class StrafesNetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "StrafesNetError";
    }
}

/**
 * The fastest times on a map, fastest first. Throws a StrafesNetError when it can't say.
 */
export async function getMapTop(apiKey: string, where: { mapId: number, game: number, style: number, course: number }, count: number) {
    const params = new URLSearchParams({
        map_id: String(where.mapId),
        game_id: String(where.game),
        style_id: String(where.style),
        mode_id: String(where.course),
        // Time ascending
        sort_by: "0",
        page_size: String(count),
        page_number: "1"
    });

    let res: Response;
    try {
        res = await fetch(`${BASE_URL}/time?${params}`, {
            headers: { "X-API-Key": apiKey },
            signal: AbortSignal.timeout(10_000)
        });
    }
    catch (err) {
        throw new StrafesNetError(`Couldn't reach StrafesNET: ${err instanceof Error ? err.message : err}`);
    }
    if (!res.ok) {
        throw new StrafesNetError(`StrafesNET answered ${res.status}`);
    }

    const times = ((await res.json()) as { data: StrafesNetTime[] }).data;
    // A tie goes to whoever got it first
    return times.sort((a, b) => a.time - b.time || Date.parse(a.date) - Date.parse(b.date));
}
