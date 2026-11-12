import { createHmac, timingSafeEqual } from "crypto";
import http from "http";
import { LinkEvent } from "./api.js";

// The site signs each event: X-Strafes-Signature is t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">.
const MAX_AGE_SECONDS = 5 * 60;
const MAX_BODY_BYTES = 64 * 1024;

export function verifySignature(secret: string, header: string | undefined, body: string, now = Date.now()) {
    if (!header) {
        return false;
    }
    const parts = new Map(header.split(",").map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index).trim(), part.slice(index + 1).trim()] as const;
    }));
    const timestamp = Number(parts.get("t"));
    const signature = parts.get("v1");
    if (!Number.isInteger(timestamp) || !signature || !/^[0-9a-f]{64}$/.test(signature)) {
        return false;
    }
    if (Math.abs(now / 1000 - timestamp) > MAX_AGE_SECONDS) {
        return false;
    }

    const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
    return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

/**
 * Listens for the site's link events. onEvent is called once per event: the site tries again if it doesn't hear
 * back, so the same event can arrive more than once.
 */
export function startWebhookServer(options: { host: string, port: number, path: string, secret: string, onEvent: (event: LinkEvent) => Promise<void> }) {
    const { host, port, path, secret, onEvent } = options;
    // Event IDs seen lately, to skip repeats
    const seen = new Map<string, number>();

    const server = http.createServer((req, res) => {
        if (req.method !== "POST" || req.url !== path) {
            res.writeHead(404).end();
            return;
        }

        let body = "";
        let tooBig = false;
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
            body += chunk;
            if (body.length > MAX_BODY_BYTES) {
                tooBig = true;
                req.destroy();
            }
        });
        req.on("end", () => {
            if (tooBig) {
                return;
            }
            if (!verifySignature(secret, req.headers["x-strafes-signature"] as string | undefined, body)) {
                res.writeHead(401).end();
                return;
            }

            let event: LinkEvent;
            try {
                event = JSON.parse(body) as LinkEvent;
            }
            catch {
                res.writeHead(400).end();
                return;
            }

            // Answer right away, and handle it after, so a slow Discord doesn't make the site try again
            res.writeHead(204).end();

            const now = Date.now();
            for (const [id, at] of seen) {
                if (now - at > 60 * 60 * 1000) seen.delete(id);
            }
            if (seen.has(event.id)) {
                return;
            }
            seen.set(event.id, now);

            onEvent(event).catch((err) => {
                console.error(`Failed to handle event ${event.id}:`, err);
            });
        });
    });

    server.listen(port, host, () => {
        console.log(`Listening for link events on http://${host}:${port}${path}`);
    });
    return server;
}
