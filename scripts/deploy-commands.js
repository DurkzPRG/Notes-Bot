import "dotenv/config";
import { REST, Routes } from "discord.js";

let pageCommands;
try {
  ({ pageCommands } = await import("./src/commands/page.js"));
} catch {
  ({ pageCommands } = await import("./page.js"));
}

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

const clientId = process.env.CLIENT_ID;
if (!clientId) throw new Error("CLIENT_ID is required");

const guildId = (process.env.GUILD_ID || "").trim();
const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);

const commands = [...pageCommands].map((c) => c.toJSON());

try {
  console.log(`Deploying ${commands.length} commands...`);
  await rest.put(route, { body: commands });
  console.log("Done.");
} catch (error) {
  console.error(error);
}
