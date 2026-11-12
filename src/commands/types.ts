import { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder } from "discord.js";
import { StrafesApi } from "../api.js";

export interface Command {
    data: SlashCommandOptionsOnlyBuilder
    execute: (interaction: ChatInputCommandInteraction, api: StrafesApi) => Promise<void>
}
