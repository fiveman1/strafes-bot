import { ChatInputCommandInteraction } from "discord.js";

// /verify replies the user can still see, by link request, so the reply can say when they've linked. Interactions can
// be edited for 15 minutes, the same time a link works for. Lost on restart, which only means the reply isn't updated.

interface PendingLink {
    interaction: ChatInputCommandInteraction
    expiresAt: number
}

const pending = new Map<string, PendingLink>();

export function addPendingLink(requestId: string, interaction: ChatInputCommandInteraction, expiresAt: string) {
    const now = Date.now();
    for (const [id, link] of pending) {
        if (link.expiresAt < now) pending.delete(id);
    }
    pending.set(requestId, { interaction, expiresAt: Date.parse(expiresAt) });
}

/** Removes it too */
export function takePendingLink(requestId: string) {
    const link = pending.get(requestId);
    pending.delete(requestId);
    return link?.interaction;
}
