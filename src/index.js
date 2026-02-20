import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import { PrismaClient, Prisma } from "@prisma/client";

console.log("BOOT: src/index.js LOADED | v=autocomplete+safeedit-fix-1");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.get("/", (_req, res) => res.status(200).send("OK"));
app.listen(PORT, "0.0.0.0", () => console.log("Health server up on port", PORT));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const prisma = new PrismaClient({ log: ["error", "warn"] });

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`Timeout after ${ms}ms${label ? `: ${label}` : ""}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

async function initDb() {
  try {
    await withTimeout(prisma.$connect(), 8000, "prisma.$connect");
    console.log("DB connected");
  } catch (err) {
    console.error("DB connect failed:", err);
  }
}
initDb();

setInterval(() => console.log("tick:", new Date().toISOString()), 60_000).unref();

function slugify(title) {
  return (title || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function looksLikeSlug(s) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s || "");
}

function trimForDiscord(s, max = 1900) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

function clampInt(n, min, max) {
  const x = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, x));
}

function ephemeralPayload(payload = {}) {
  // Avoid deprecated "ephemeral: true" by using flags.
  // Works in discord.js v14+.
  return { ...payload, flags: MessageFlags.Ephemeral };
}

async function safeReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch (err) {
    console.error("safeReply failed:", err);
    return null;
  }
}

async function safeEdit(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
    return await interaction.reply(payload);
  } catch (err) {
    try {
      if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
      return await interaction.followUp(payload);
    } catch (err2) {
      console.error("safeEdit failed:", err2);
      return null;
    }
  }
}

async function ensureWorkspace(workspaceId) {
  try {
    await withTimeout(
      prisma.workspace.upsert({ where: { id: workspaceId }, update: {}, create: { id: workspaceId } }),
      8000,
      "ensureWorkspace"
    );
  } catch (err) {
    console.error("ensureWorkspace failed:", err);
  }
}

async function findPageByQuery(workspaceId, query) {
  const q = (query || "").trim();
  const slug = looksLikeSlug(q) ? q.toLowerCase() : slugify(q);

  const bySlug = await withTimeout(
    prisma.page.findUnique({ where: { workspaceId_slug: { workspaceId, slug } } }),
    8000,
    "findPageByQuery/bySlug"
  );
  if (bySlug) return bySlug;

  const byTitle = await withTimeout(
    prisma.page.findFirst({ where: { workspaceId, title: { equals: q, mode: "insensitive" } } }),
    8000,
    "findPageByQuery/byTitle"
  );
  return byTitle;
}

function makeListKey(workspaceId, search, pageNum) {
  const s = (search || "").trim();
  const p = clampInt(pageNum || 1, 1, 1000);
  return `pl|${workspaceId}|${encodeURIComponent(s)}|${p}`;
}

function parseListKey(customId) {
  if (!customId || !customId.startsWith("pl|")) return null;
  const parts = customId.split("|");
  if (parts.length !== 4) return null;
  const workspaceId = parts[1];
  const search = decodeURIComponent(parts[2] || "");
  const pageNum = Number(parts[3]);
  return { workspaceId, search, pageNum: Number.isFinite(pageNum) ? pageNum : 1 };
}

function openKey(workspaceId, slug) {
  return `po|${workspaceId}|${slug}`;
}
function parseOpenKey(customId) {
  if (!customId || !customId.startsWith("po|")) return null;
  const parts = customId.split("|");
  if (parts.length !== 3) return null;
  return { workspaceId: parts[1], slug: parts[2] };
}
function editKey(workspaceId, slug) {
  return `pe|${workspaceId}|${slug}`;
}
function delKey(workspaceId, slug) {
  return `pd|${workspaceId}|${slug}`;
}
function delConfirmKey(workspaceId, slug) {
  return `pdc|${workspaceId}|${slug}`;
}
function parseKey3(prefix, customId) {
  if (!customId || !customId.startsWith(prefix + "|")) return null;
  const parts = customId.split("|");
  if (parts.length !== 3) return null;
  return { workspaceId: parts[1], slug: parts[2] };
}
function modalEditId(workspaceId, slug) {
  return `pm|${workspaceId}|${slug}`;
}
function parseModalEditId(customId) {
  if (!customId || !customId.startsWith("pm|")) return null;
  const parts = customId.split("|");
  if (parts.length !== 3) return null;
  return { workspaceId: parts[1], slug: parts[2] };
}

function isAdmin(interaction) {
  try {
    return Boolean(
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
        interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    );
  } catch {
    return false;
  }
}

async function refreshSearchVector(pageId) {
  try {
    await withTimeout(
      prisma.$executeRaw(
        Prisma.sql`UPDATE "Page" SET "searchVector" = to_tsvector('simple', coalesce("title",'') || ' ' || coalesce("contentMd",'')) WHERE "id" = ${pageId}`
      ),
      8000,
      "refreshSearchVector"
    );
  } catch (err) {
    console.error("refreshSearchVector failed:", err);
  }
}

async function renderPageOpen(workspaceId, page) {
  const meta = [
    `version: ${page.version}`,
    `updated: ${new Date(page.updatedAt).toISOString().slice(0, 19).replace("T", " ")}`,
  ].join("\n");

  const content = (page.contentMd || "").trim() || "(empty)";
  const text = `${page.title} (slug: ${page.slug})\n\n${meta}\n\n${content}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(editKey(workspaceId, page.slug)).setLabel("Edit").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(delKey(workspaceId, page.slug)).setLabel("Delete").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(openKey(workspaceId, page.slug)).setLabel("Refresh").setStyle(ButtonStyle.Secondary)
  );

  return { content: trimForDiscord(text, 1900), components: [row] };
}

async function runPageList(interaction, workspaceId, search, pageNum) {
  const take = 10;
  const p = clampInt(pageNum || 1, 1, 1000);
  const skip = (p - 1) * take;
  const s = (search || "").trim();

  const where = {
    workspaceId,
    ...(s
      ? {
          OR: [
            { title: { contains: s, mode: "insensitive" } },
            { slug: { contains: slugify(s), mode: "insensitive" } },
            { contentMd: { contains: s, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await withTimeout(
    Promise.all([
      prisma.page.count({ where }),
      prisma.page.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
        select: { title: true, slug: true, id: true },
      }),
    ]),
    8000,
    "page-list query"
  );

  const totalPages = Math.max(1, Math.ceil(total / take));
  const current = clampInt(p, 1, totalPages);

  if (!rows.length) {
    return safeEdit(interaction, ephemeralPayload({ content: s ? "No pages found for that search." : "No pages yet.", components: [] }));
  }

  const header =
    `Pages ${skip + 1}-${Math.min(skip + rows.length, total)} of ${total} (page ${current}/${totalPages})` + (s ? ` | search: ${s}` : "");

  const lines = rows.map((r, i) => `${skip + i + 1}. ${r.title}  |  ${r.slug}`);

  // FIX: Avoid duplicated custom_id when totalPages === 1
  const prevPage = Math.max(1, current - 1);
  const nextPage = Math.min(totalPages, current + 1);
  const prevId = makeListKey(workspaceId, s, prevPage);
  const nextId = makeListKey(workspaceId, s, nextPage);

  let components = [];

  if (totalPages > 1) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(prevId)
        .setLabel("Previous")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current <= 1),
      new ButtonBuilder()
        .setCustomId(nextId)
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(current >= totalPages)
    );
    components = [row];
  }

  return safeEdit(interaction, ephemeralPayload({ content: trimForDiscord(`${header}\n\n${lines.join("\n")}`, 1900), components }));
}

client.once("ready", () => {
  console.log(`Bot online como ${client.user?.tag}`);
});
client.once("clientReady", () => {
  console.log(`Bot online (clientReady) como ${client.user?.tag}`);
});

client.on("interactionCreate", (interaction) => {
  // Log immediately (no await before) so we always see it in Render logs
  try {
    console.error("INTERACTION RECEIVED:", {
      id: interaction.id,
      type: interaction.type,
      isChat: Boolean(interaction.isChatInputCommand?.()),
      isBtn: Boolean(interaction.isButton?.()),
      cmd: interaction.commandName,
      customId: interaction.customId,
      guildId: interaction.guildId,
    });
  } catch (e) {
    console.error("INTERACTION LOG FAILED:", e);
  }

  (async () => {
    try {

if (interaction.isAutocomplete()) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.respond([]).catch(() => {});
    return;
  }

  const cmd = interaction.commandName;
  const focused = interaction.options.getFocused(true);
  const q = String(focused?.value ?? "").trim();

  if (
    cmd === "page-open" ||
    cmd === "page-rename" ||
    cmd === "page-move" ||
    cmd === "tag-add" ||
    cmd === "tag-remove" ||
    cmd === "backlinks" ||
    cmd === "export" ||
    cmd === "import" ||
    cmd === "page-history" ||
    cmd === "page-rollback" ||
    cmd === "perm-set" ||
    cmd === "perm-list" ||
    cmd === "perm-clear"
  ) {
    const where = q
      ? {
          workspaceId: guildId,
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { slug: { contains: slugify(q), mode: "insensitive" } },
            { contentMd: { contains: q, mode: "insensitive" } },
          ],
        }
      : { workspaceId: guildId };

    const rows = await withTimeout(
      prisma.page.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        take: 25,
        select: { title: true, slug: true },
      }),
      8000,
      "autocomplete/pages"
    ).catch(() => []);

    const choices = (rows || []).slice(0, 25).map((r) => ({
      name: `${r.title}`.slice(0, 100),
      value: r.slug,
    }));

    await interaction.respond(choices).catch(() => {});
    return;
  }

  await interaction.respond([]).catch(() => {});
  return;
}

      if (interaction.isButton()) {
        const guildId = interaction.guildId;
        if (!guildId) return;

        // Pagination buttons
        if (interaction.customId.startsWith("pl|")) {
          const parsed = parseListKey(interaction.customId);
          if (!parsed) return;

          await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
          if (parsed.workspaceId !== guildId) return safeEdit(interaction, ephemeralPayload({ content: "Invalid action.", components: [] }));
          return runPageList(interaction, guildId, parsed.search, parsed.pageNum);
        }

        // Refresh page
        if (interaction.customId.startsWith("po|")) {
          const parsed = parseOpenKey(interaction.customId);
          if (!parsed) return;

          await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
          if (parsed.workspaceId !== guildId) return safeEdit(interaction, ephemeralPayload({ content: "Invalid action.", components: [] }));

          const page = await withTimeout(
            prisma.page.findUnique({ where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } } }),
            8000,
            "page-open button"
          );
          if (!page) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));

          const payload = await renderPageOpen(guildId, page);
          return safeEdit(interaction, ephemeralPayload(payload));
        }

        return;
      }

      if (!interaction.isChatInputCommand()) return;

      const guildId = interaction.guildId;
      if (!guildId) {
        return interaction.reply(ephemeralPayload({ content: "This command only works inside a server." })).catch(() => {});
      }

      await ensureWorkspace(guildId);

      if (interaction.commandName === "page-list") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const search = interaction.options.getString("search") ?? "";
        return runPageList(interaction, guildId, search, 1);
      }

      if (interaction.commandName === "page-open") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const query = interaction.options.getString("query", true);
        const page = await findPageByQuery(guildId, query);
        if (!page) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));

        const payload = await renderPageOpen(guildId, page);
        return safeEdit(interaction, ephemeralPayload(payload));
      }

      if (interaction.commandName === "page-create") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const title = interaction.options.getString("title", true);
        const content = interaction.options.getString("content") ?? "";
        const slug = slugify(title) || "page";

        const page = await withTimeout(
          prisma.page.create({ data: { workspaceId: guildId, title, slug, contentMd: content } }),
          8000,
          "page-create/create"
        );

        await refreshSearchVector(page.id);
        const payload = await renderPageOpen(guildId, page);
        return safeEdit(interaction, ephemeralPayload(payload));
      }

      if (interaction.commandName === "help") {
        const msg = [
          "Commands",
          "",
          "/page-create title content",
          "/page-open query",
          "/page-list [search]",
        ].join("\n");
        return interaction.reply(ephemeralPayload({ content: trimForDiscord(msg, 1900) })).catch(() => {});
      }

      return interaction.reply(ephemeralPayload({ content: "Unknown command." })).catch(() => {});
    } catch (err) {
      console.error("interaction handler crashed:", err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(ephemeralPayload({ content: "Command error.", components: [] }));
        } else {
          await interaction.reply(ephemeralPayload({ content: "Command error." }));
        }
      } catch {}
    }
  })();
});

process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
