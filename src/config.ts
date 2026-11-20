function required(name: string) {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing ${name} (see .env.example)`);
        process.exit(1);
    }
    return value;
}

function optional(name: string) {
    return process.env[name] || undefined;
}

export const config = {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    devGuildId: optional("DISCORD_DEV_GUILD_ID"),

    strafesApiUrl: (optional("STRAFES_API_URL") ?? "https://strafes.fiveman1.net/public-api/v1").replace(/\/$/, ""),
    strafesApiKey: required("STRAFES_API_KEY"),
    webhookSecret: required("STRAFES_WEBHOOK_SECRET"),

    webhookPort: +(optional("WEBHOOK_PORT") ?? 8090),
    webhookHost: optional("WEBHOOK_HOST") ?? "127.0.0.1",

    verifiedRoleId: optional("VERIFIED_ROLE_ID"),
    setNicknames: optional("SET_NICKNAMES") === "true",
    welcomeChannelId: optional("WELCOME_CHANNEL_ID"),
    logChannelId: optional("LOG_CHANNEL_ID"),

    globalsChannels: {
        all: optional("GLOBALS_CHANNEL_ID"),
        bhopAuto: optional("BHOP_AUTO_GLOBALS_CHANNEL_ID"),
        bhopStyles: optional("BHOP_STYLES_GLOBALS_CHANNEL_ID"),
        surfAuto: optional("SURF_AUTO_GLOBALS_CHANNEL_ID"),
        surfStyles: optional("SURF_STYLES_GLOBALS_CHANNEL_ID")
    },
    /** Only needed for globals */
    strafesNetApiKey: optional("STRAFES_NET_API_KEY")
};

/** Globals are on when any of their channels is set */
export const globalsEnabled = Object.values(config.globalsChannels).some((id) => id !== undefined);
if (globalsEnabled && !config.strafesNetApiKey) {
    console.error("Missing STRAFES_NET_API_KEY, which globals need (see .env.example)");
    process.exit(1);
}
