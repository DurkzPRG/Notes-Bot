import "dotenv/config";
import { REST, Routes } from "discord.js";
import { pageCommands } from "../src/commands/page.js";

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const commands = [...pageCommands].map((c) => c.toJSON());

try {
  console.log(`Deploying ${commands.length} commands...`);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands,
  });
  console.log("Done.");
} catch (error) {
  console.error(error);
}