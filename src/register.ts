// Registers the slash commands with Discord. Run it after adding or changing a command (not on every start).
// With DISCORD_DEV_GUILD_ID they're registered to that server only, which shows up right away.

import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_DEV_GUILD_ID || undefined;
if (!token || !clientId) {
    console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID (see .env.example)");
    process.exit(1);
}

const rest = new REST().setToken(token);
const body = commands.map((command) => command.data.toJSON());
const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);

await rest.put(route, { body });
console.log(`Registered ${body.length} commands ${guildId ? `to server ${guildId}` : "globally"}: ${body.map((command) => "/" + command.name).join(", ")}`);
