// A client for the strafes public API. Docs: https://strafes.fiveman1.net/public-api/docs

export interface DiscordLink {
    discordId: string
    robloxId: number
    linkedAt: string | null
}

export type LinkRequestStatus = "pending" | "completed" | "cancelled" | "expired";

export interface LinkRequest {
    id: string
    status: LinkRequestStatus
    discordId: string
    createdAt: string
    expiresAt: string
    completedAt?: string
    robloxId?: number
    robloxUsername?: string
    previousRobloxId?: number
}

export interface CreatedLinkRequest extends LinkRequest {
    url: string
}

export interface LinkEvent {
    id: string
    type: "link.completed"
    createdAt: string
    data: LinkRequest
}

export class StrafesApiError extends Error {
    readonly status: number | undefined;
    readonly code: string | undefined;

    constructor(message: string, status?: number, code?: string) {
        super(message);
        this.name = "StrafesApiError";
        this.status = status;
        this.code = code;
    }
}

export class StrafesApi {

    constructor(protected readonly baseUrl: string, protected readonly apiKey: string) {
    }

    /** null if the Discord account isn't linked */
    async getLink(discordId: string) {
        return await this.request<DiscordLink>("GET", `/links/discord/${discordId}`, undefined, true);
    }

    /** What it was linked to, or null if it wasn't linked */
    async unlink(discordId: string) {
        return await this.request<{ discordId: string, robloxId: number }>("DELETE", `/links/discord/${discordId}`, undefined, true);
    }

    async getDiscordIdsForRoblox(robloxId: number) {
        return (await this.request<{ robloxId: number, discordIds: string[] }>("GET", `/links/roblox/${robloxId}`))!.discordIds;
    }

    async createLinkRequest(discordId: string, discordUsername?: string, discordAvatarUrl?: string) {
        return (await this.request<CreatedLinkRequest>("POST", "/link-requests", { discordId, discordUsername, discordAvatarUrl }))!;
    }

    /** null if this key didn't make a request with that ID (or it's over 30 days old) */
    async getLinkRequest(id: string) {
        return await this.request<LinkRequest>("GET", `/link-requests/${id}`, undefined, true);
    }

    protected async request<T>(method: string, path: string, body?: object, nullOn404?: boolean): Promise<T | null> {
        let res: Response;
        try {
            res = await fetch(this.baseUrl + path, {
                method: method,
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    ...(body ? { "Content-Type": "application/json" } : {})
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: AbortSignal.timeout(10_000)
            });
        }
        catch (err) {
            throw new StrafesApiError(`Couldn't reach the strafes API: ${err instanceof Error ? err.message : err}`);
        }

        if (res.status === 404 && nullOn404) {
            return null;
        }

        const data = await res.json().catch(() => undefined) as { error?: { code: string, message: string } } | undefined;
        if (!res.ok) {
            throw new StrafesApiError(data?.error?.message ?? `The strafes API answered ${res.status}`, res.status, data?.error?.code);
        }
        return data as T;
    }
}

/** The Roblox username, or undefined if Roblox couldn't say */
export async function getRobloxUsername(robloxId: number) {
    try {
        const res = await fetch(`https://users.roblox.com/v1/users/${robloxId}`, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) {
            return undefined;
        }
        return ((await res.json()) as { name?: string }).name;
    }
    catch {
        return undefined;
    }
}

/** A URL for the Roblox account's headshot, or undefined if Roblox couldn't give one (or it isn't ready yet) */
export async function getRobloxHeadshotUrl(robloxId: number) {
    try {
        const params = new URLSearchParams({ userIds: String(robloxId), size: "150x150", format: "Png", isCircular: "false" });
        const res = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?${params}`, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) {
            return undefined;
        }
        const thumbnail = ((await res.json()) as { data?: { state?: string, imageUrl?: string }[] }).data?.[0];
        // "Blocked" still has an image (Roblox's placeholder), "Pending" and errors don't
        return thumbnail?.imageUrl || undefined;
    }
    catch {
        return undefined;
    }
}

export function robloxProfileUrl(robloxId: number) {
    return `https://www.roblox.com/users/${robloxId}/profile`;
}

export function strafesUserUrl(robloxId: number) {
    return `https://strafes.fiveman1.net/users/${robloxId}`;
}
