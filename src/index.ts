import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { postVerificationLog, postWelcome } from "./announce.js";
import { getRobloxHeadshotUrl, getRobloxUsername, LinkEvent, StrafesApi, StrafesApiError } from "./api.js";
import { commands } from "./commands/index.js";
import { runVerify, VERIFY_BUTTON_ID } from "./commands/verify.js";
import { config } from "./config.js";
import { takePendingLink } from "./pending.js";
import { syncLinkedMember } from "./roles.js";
import { startWebhookServer } from "./webhook.js";

const api = new StrafesApi(config.strafesApiUrl, config.strafesApiKey);
const commandsByName = new Map(commands.map((command) => [command.data.name, command]));

// Guilds is all it needs: slash commands come without any intents, and fetching one member doesn't need the
// privileged members intent
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (ready) => {
    console.log(`Logged in as ${ready.user.tag}, in ${ready.guilds.cache.size} server(s)`);
});

client.on(Events.InteractionCreate, async (interaction) => {
    let name: string;
    let run: () => Promise<void>;
    if (interaction.isChatInputCommand()) {
        const command = commandsByName.get(interaction.commandName);
        if (!command) {
            return;
        }
        name = `/${interaction.commandName}`;
        run = () => command.execute(interaction, api);
    }
    else if (interaction.isButton() && interaction.customId === VERIFY_BUTTON_ID) {
        name = "The verify button";
        run = () => runVerify(interaction, api);
    }
    else {
        return;
    }

    try {
        await run();
    }
    catch (err) {
        console.error(`${name} failed:`, err);
        const message = err instanceof StrafesApiError && err.status === 429
            ? "Too many requests right now, try again in a minute."
            : "Something went wrong, try again in a bit.";
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: message, embeds: [], components: [] });
            }
            else {
                await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            }
        }
        catch {
            // The interaction expired, nothing to tell them with
        }
    }
});

async function onLinkEvent(event: LinkEvent) {
    if (event.type !== "link.completed") {
        return;
    }
    const request = event.data;
    console.log(`${request.discordId} linked to Roblox ${request.robloxId}`);

    const robloxId = request.robloxId!;
    const username = request.robloxUsername ?? await getRobloxUsername(robloxId);
    const roles = await syncLinkedMember(client, request.discordId, username);

    const interaction = takePendingLink(request.id);
    if (interaction) {
        await interaction.editReply({
            content: `✅ Linked to **${username ?? request.robloxId}**.`,
            embeds: [],
            components: []
        }).catch((err) => {
            // Past the 15 minutes, or they dismissed it
            console.warn(`Couldn't update the /verify reply for ${request.discordId}:`, err.message);
        });
    }

    const previousRobloxId = request.previousRobloxId !== robloxId ? request.previousRobloxId : undefined;
    const [headshotUrl, previousUsername, user] = await Promise.all([
        getRobloxHeadshotUrl(robloxId),
        previousRobloxId ? getRobloxUsername(previousRobloxId) : undefined,
        roles.changed[0]?.user ?? client.users.fetch(request.discordId).catch(() => undefined)
    ]);
    // Welcomed in the servers where this made them verified, so changing which account is linked doesn't welcome
    // them again
    for (const member of roles.changed) {
        await postWelcome(member, { robloxId, robloxUsername: username, headshotUrl });
    }
    await postVerificationLog(client, {
        discordId: request.discordId,
        user: user,
        robloxId: robloxId,
        robloxUsername: username,
        headshotUrl: headshotUrl,
        previous: previousRobloxId ? { robloxId: previousRobloxId, robloxUsername: previousUsername } : undefined,
        how: "linked",
        roleGivenIn: roles.changed.map((member) => member.guild.name),
        roleFailedIn: roles.failed.map((guild) => guild.name)
    });
}

startWebhookServer({
    host: config.webhookHost,
    port: config.webhookPort,
    path: "/link-events",
    secret: config.webhookSecret,
    onEvent: onLinkEvent
});

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled promise rejection:", reason);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
        await client.destroy();
        process.exit(0);
    });
}

await client.login(config.discordToken);
