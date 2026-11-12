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
    logChannelId: optional("LOG_CHANNEL_ID")
};
