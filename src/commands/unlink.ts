import { InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";
import { getRobloxUsername } from "../api.js";
import { syncLinkedMember } from "../roles.js";
import { Command } from "./types.js";

export const unlink: Command = {
    data: new SlashCommandBuilder()
        .setName("unlink")
        .setDescription("Unlink your Roblox account from your Discord account")
        .setContexts(InteractionContextType.Guild),

    async execute(interaction, api) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const unlinked = await api.unlink(interaction.user.id);
        if (!unlinked) {
            await interaction.editReply("You don't have a Roblox account linked.");
            return;
        }

        const username = await getRobloxUsername(unlinked.robloxId);
        await syncLinkedMember(interaction.client, interaction.user.id, null, username);
        await interaction.editReply(`Unlinked from **${username ?? unlinked.robloxId}**. Use \`/verify\` to link again.`);
    }
};
