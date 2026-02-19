import { SlashCommandBuilder } from "discord.js";

export const pageCommands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows help for the bot"),

  new SlashCommandBuilder()
    .setName("page-create")
    .setDescription("Create a page")
    .addStringOption((o) => o.setName("title").setDescription("Title").setRequired(true))
    .addStringOption((o) => o.setName("content").setDescription("Content (markdown)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("page-open")
    .setDescription("Open a page (by slug or title)")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName("page-list")
    .setDescription("List pages")
    .addStringOption((o) => o.setName("search").setDescription("Filter by title/slug/content").setRequired(false)),

  new SlashCommandBuilder()
    .setName("page-rename")
    .setDescription("Rename a page")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("title").setDescription("New title").setRequired(true))
    .addBooleanOption((o) => o.setName("keep_slug").setDescription("Keep current slug").setRequired(false)),

  new SlashCommandBuilder()
    .setName("page-move")
    .setDescription("Move page into a folder (prefix in title)")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("folder").setDescription("Example: build/guides").setRequired(true)),

  new SlashCommandBuilder()
    .setName("tag-add")
    .setDescription("Add tags to a page")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("tags").setDescription("Example: build,todo,guide").setRequired(true)),

  new SlashCommandBuilder()
    .setName("tag-remove")
    .setDescription("Remove tags from a page")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("tags").setDescription("Example: build,todo").setRequired(true)),

  new SlashCommandBuilder()
    .setName("tag-list")
    .setDescription("List tags")
    .addStringOption((o) => o.setName("search").setDescription("Filter by tag").setRequired(false)),

  new SlashCommandBuilder()
    .setName("search")
    .setDescription("Full-text search (Postgres)")
    .addStringOption((o) => o.setName("q").setDescription("Query").setRequired(true)),

  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Create/open daily note")
    .addStringOption((o) => o.setName("date").setDescription("YYYY-MM-DD (optional)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("template-create")
    .setDescription("Create/update a template")
    .addStringOption((o) => o.setName("name").setDescription("Template name").setRequired(true))
    .addStringOption((o) => o.setName("content").setDescription("Template content (markdown)").setRequired(true)),

  new SlashCommandBuilder()
    .setName("template-use")
    .setDescription("Create a page from a template")
    .addStringOption((o) => o.setName("name").setDescription("Template name").setRequired(true))
    .addStringOption((o) => o.setName("title").setDescription("New page title").setRequired(true)),

  new SlashCommandBuilder()
    .setName("backlinks")
    .setDescription("Find pages that link to this page using [[...]]")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName("export")
    .setDescription("Export a page as markdown")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName("import")
    .setDescription("Import markdown content into a page (overwrite)")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName("content").setDescription("Markdown content").setRequired(true)),

  new SlashCommandBuilder()
    .setName("page-history")
    .setDescription("Show page version history")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName("limit").setDescription("Max results").setRequired(false)),

  new SlashCommandBuilder()
    .setName("page-rollback")
    .setDescription("Rollback a page to a previous version")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title").setRequired(true).setAutocomplete(true))
    .addIntegerOption((o) => o.setName("version").setDescription("Version number (optional)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("perm-set")
    .setDescription("Set permissions for a role (optional channel / optional page scope)")
    .addStringOption((o) => o.setName("role_id").setDescription("Discord role id").setRequired(true))
    .addBooleanOption((o) => o.setName("read").setDescription("Allow read").setRequired(true))
    .addBooleanOption((o) => o.setName("write").setDescription("Allow write").setRequired(true))
    .addStringOption((o) => o.setName("query").setDescription("Slug or title (optional)").setRequired(false).setAutocomplete(true))
    .addStringOption((o) => o.setName("channel_id").setDescription("Discord channel id (optional)").setRequired(false)),

  new SlashCommandBuilder()
    .setName("perm-list")
    .setDescription("List permissions (optional page scope)")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title (optional)").setRequired(false).setAutocomplete(true)),

  new SlashCommandBuilder()
    .setName("perm-clear")
    .setDescription("Clear permissions (optional page scope)")
    .addStringOption((o) => o.setName("query").setDescription("Slug or title (optional)").setRequired(false).setAutocomplete(true)),
];