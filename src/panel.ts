// Posts the verify panel in a channel: an embed with a button that does the same as /verify, so verifying works in a
// channel people can't type in (which also stops slash commands there). Run it once per channel:
//   yarn panel <channel id>
// The button is found by its ID rather than by message, so it keeps working across restarts and redeploys. To change
// the panel, delete the old one and post it again.

import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, REST, Routes } from "discord.js";
import { VERIFY_BUTTON_ID } from "./commands/verify.js";
import { config } from "./config.js";

const channelId = process.argv[2];
if (!channelId || !/^\d+$/.test(channelId)) {
    console.error("Usage: yarn panel <channel id>");
    process.exit(1);
}

const embed = new EmbedBuilder()
    .setTitle("Verify your Roblox account")
    .setDescription("To see the rest of the server, link your Roblox account: click **Verify**, log in with Roblox, and "
        + "confirm.\n\nOnly you will see the link. Already linked? Clicking it gets you verified right away.")
    .setColor(0xee4b93);
const button = new ButtonBuilder()
    .setCustomId(VERIFY_BUTTON_ID)
    .setStyle(ButtonStyle.Primary)
    .setLabel("Verify");

const rest = new REST().setToken(config.discordToken);
await rest.post(Routes.channelMessages(channelId), {
    body: {
        embeds: [embed.toJSON()],
        components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button).toJSON()]
    }
});
console.log(`Posted the verify panel in channel ${channelId}`);
