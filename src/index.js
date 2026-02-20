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

console.log("BOOT: src/index.js LOADED | v=stabilized-3");



const processedInteractions = globalThis.__processedInteractions ?? new Map();
globalThis.__processedInteractions = processedInteractions;

setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of processedInteractions.entries()) {
    if (now - ts > 60_000) processedInteractions.delete(id);
  }
}, 30_000).unref();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.get("/", (_req, res) => res.status(200).send("OK"));
app.listen(PORT, "0.0.0.0", () => console.log("Health server up on port", PORT));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const prisma = new PrismaClient({ log: ["error", "warn"] });


async function ensureWorkspace(_workspaceId) {
  return;
}

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
    const code = err?.code;
    if (code === 40060) {
      try {
        return await interaction.editReply(payload);
      } catch (err2) {
        console.error("safeEdit failed:", err2);
        return null;
      }
    }
    if (code === 10062) {
      console.error("safeEdit failed:", err);
      return null;
    }
    try {
      if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
      return await interaction.reply(payload);
    } catch (err2) {
      console.error("safeEdit failed:", err2);
      return null;
    }
  }
}

async function safeDeferReply(interaction, flags) {
  try {
    if (interaction.deferred || interaction.replied) return true;
    await interaction.deferReply({ flags });
    return true;
  } catch (err) {
    const code = err?.code;
    if (code === 40060) return true;
    console.error("safeDeferReply failed:", err);
    return false;
  }
}


async function safeDeferUpdate(interaction) {
  try {
    if (interaction.deferred || interaction.replied) return true;
    await interaction.deferUpdate();
    return true;
  } catch (err) {
    const code = err?.code;
    if (code === 40060) return true;
    console.error("safeDeferUpdate failed:", err);
    return false;
  }
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

function editModalKey(workspaceId, slug) {
  return `pem|${workspaceId}|${slug}`;
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


async function findPageByQuery(workspaceId, query) {
  const q = String(query || "").trim();
  if (!q) return null;

  if (looksLikeSlug(q)) {
    const bySlug = await withTimeout(
      prisma.page.findUnique({ where: { workspaceId_slug: { workspaceId, slug: q } } }),
      8000,
      "findPageByQuery/slug"
    ).catch(() => null);
    if (bySlug) return bySlug;
  }

  const slugQ = slugify(q);
  const rows = await withTimeout(
    prisma.page.findMany({
      where: {
        workspaceId,
        OR: [
          { title: { equals: q, mode: "insensitive" } },
          ...(slugQ ? [{ slug: { equals: slugQ, mode: "insensitive" } }] : []),
          { title: { contains: q, mode: "insensitive" } },
          ...(slugQ ? [{ slug: { contains: slugQ, mode: "insensitive" } }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 1,
    }),
    8000,
    "findPageByQuery/fuzzy"
  ).catch(() => []);
  return rows?.[0] ?? null;
}

client.once("ready", () => {
  console.log(`Bot online como ${client.user?.tag}`);
});
client.once("clientReady", () => {
  console.log(`Bot online (clientReady) como ${client.user?.tag}`);
});


if (globalThis.__interactionCreateInstalled) {
  try { client.removeAllListeners("interactionCreate"); } catch {}
}
globalThis.__interactionCreateInstalled = true;

client.removeAllListeners("interactionCreate");
client.on("interactionCreate", (interaction) => {

const _seenTs = processedInteractions.get(interaction.id);
if (_seenTs) return;
processedInteractions.set(interaction.id, Date.now());

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

        
if (interaction.customId.startsWith("pe|")) {
  const parsed = parseKey3("pe", interaction.customId);
  if (!parsed) return;

  if (parsed.workspaceId !== guildId) {
    if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
    return safeEdit(interaction, ephemeralPayload({ content: "Invalid action.", components: [] }));
  }

  const pagePromise = withTimeout(
    prisma.page.findUnique({ where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } } }),
    1800,
    "page-edit/get"
  ).catch(() => null);

  const page = await Promise.race([pagePromise, new Promise((resolve) => setTimeout(() => resolve(null), 1200))]);

  const contentValue = page?.contentMd ? String(page.contentMd).slice(0, 4000) : "";
  const titleValue = page?.title ? String(page.title).slice(0, 100) : parsed.slug;

  const modal = new ModalBuilder()
    .setCustomId(editModalKey(guildId, parsed.slug))
    .setTitle("Edit page")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Title")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setValue(titleValue)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("content")
          .setLabel("Content (Markdown)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(4000)
          .setValue(contentValue)
      )
    );

  await interaction.showModal(modal).catch(async () => {
    if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
    return safeEdit(interaction, ephemeralPayload({ content: "Could not open editor (try again).", components: [] }));
  });
  return;
}

if (interaction.customId.startsWith("pl|")) {
          const parsed = parseListKey(interaction.customId);
          if (!parsed) return;

          if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
          if (parsed.workspaceId !== guildId) return safeEdit(interaction, ephemeralPayload({ content: "Invalid action.", components: [] }));
          return runPageList(interaction, guildId, parsed.search, parsed.pageNum);
        }

        if (interaction.customId.startsWith("po|")) {
          const parsed = parseOpenKey(interaction.customId);
          if (!parsed) return;

          if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
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

        
if (interaction.customId.startsWith("pd|")) {
  const parsed = parseKey3("pd", interaction.customId);
  if (!parsed) return;

  if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
  if (parsed.workspaceId !== guildId) return safeEdit(interaction, ephemeralPayload({ content: "Invalid action.", components: [] }));

  const page = await withTimeout(
    prisma.page.findUnique({ where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } } }),
    8000,
    "page-delete/get"
  ).catch(() => null);

  if (!page) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(delConfirmKey(guildId, parsed.slug)).setLabel("Confirm delete").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(openKey(guildId, parsed.slug)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );

  return safeEdit(
    interaction,
    ephemeralPayload({
      content: `⚠️ Delete **${page.title}**? This cannot be undone.`,
      components: [row],
    })
  );
}

if (interaction.customId.startsWith("pdc|")) {
  const parsed = parseKey3("pdc", interaction.customId);
  if (!parsed) return;

  if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
  if (parsed.workspaceId !== guildId) return safeEdit(interaction, ephemeralPayload({ content: "Invalid action.", components: [] }));

  await withTimeout(
    prisma.page.delete({ where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } } }),
    8000,
    "page-delete/delete"
  ).catch(async (err) => {
    if (err?.code === "P2025") return null;
    throw err;
  });

  return safeEdit(interaction, ephemeralPayload({ content: "✅ Page deleted.", components: [] }));
}

return;
      }

      
if (interaction.isModalSubmit && interaction.isModalSubmit()) {
  const guildId = interaction.guildId;
  if (!guildId) return;

  if (interaction.customId.startsWith("pem|")) {
    const parsed = parseKey3("pem", interaction.customId);
    if (!parsed) return;

    if (parsed.workspaceId !== guildId) {
      if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
      return safeEdit(interaction, ephemeralPayload({ content: "Invalid action.", components: [] }));
    }

    const newTitle = String(interaction.fields.getTextInputValue("title") || "").trim().slice(0, 100);
    const newContent = String(interaction.fields.getTextInputValue("content") || "");

    if (!newTitle) {
      if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
      return safeEdit(interaction, ephemeralPayload({ content: "Title cannot be empty.", components: [] }));
    }

    if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;

    const baseSlug = slugify(newTitle) || parsed.slug;
    let slug = baseSlug;

    let updated = null;
    for (let i = 0; i < 25; i++) {
      try {
        updated = await withTimeout(
          prisma.page.update({
            where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } },
            data: { title: newTitle, slug, contentMd: newContent },
          }),
          8000,
          "page-edit/update"
        );
        break;
      } catch (err) {
        if (err?.code === "P2002") {
          slug = `${baseSlug}-${i + 2}`;
          continue;
        }
        if (err?.code === "P2025") break;
        throw err;
      }
    }

    if (!updated) return safeEdit(interaction, ephemeralPayload({ content: "Page not found (maybe deleted).", components: [] }));

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(openKey(guildId, updated.slug)).setLabel("Open").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(makeListKey(guildId, "", 1)).setLabel("Back to list").setStyle(ButtonStyle.Secondary)
    );

    return safeEdit(
      interaction,
      ephemeralPayload({
        content: `✅ Saved: **${updated.title}** (slug: \`${updated.slug}\`)`,
        components: [row],
      })
    );
  }

  return;
}

if (!interaction.isChatInputCommand()) return;

      const guildId = interaction.guildId;
      if (!guildId) {
        return interaction.reply(ephemeralPayload({ content: "This command only works inside a server." })).catch(() => {});
      }
      if (interaction.commandName === "page-list") {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        const search = interaction.options.getString("search") ?? "";
        return runPageList(interaction, guildId, search, 1);
      }

      if (interaction.commandName === "page-open") {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        const query = interaction.options.getString("query", true);
        const page = await findPageByQuery(guildId, query);
        if (!page) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));

        const payload = await renderPageOpen(guildId, page);
        return safeEdit(interaction, ephemeralPayload(payload));
      }

      if (interaction.commandName === "page-create") {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        const title = interaction.options.getString("title", true);
        const content = interaction.options.getString("content") ?? "";
        
const baseSlug = slugify(title) || "page";

let page = null;
let slug = baseSlug;
for (let i = 0; i < 25; i++) {
  try {
    page = await withTimeout(
      prisma.page.create({ data: { workspaceId: guildId, title, slug, contentMd: content } }),
      8000,
      "page-create/create"
    );
    break;
  } catch (err) {
    if (err?.code === "P2002") {
      slug = `${baseSlug}-${i + 2}`;
      continue;
    }
    throw err;
  }
}

if (!page) {
  return safeEdit(
    interaction,
    ephemeralPayload({ content: "Could not create the page (slug collision). Try a different title." })
  );
}
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

      
      if (interaction.commandName === "page-rename") {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        const query = interaction.options.getString("query", true);
        const newTitle = String(interaction.options.getString("title", true)).trim().slice(0, 100);
        const keepSlug = Boolean(interaction.options.getBoolean("keep_slug") ?? false);

        const page = await findPageByQuery(guildId, query);
        if (!page) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));
        if (!newTitle) return safeEdit(interaction, ephemeralPayload({ content: "Title cannot be empty.", components: [] }));

        let slug = page.slug;
        if (!keepSlug) {
          const baseSlug = slugify(newTitle) || "page";
          slug = baseSlug;
          for (let i = 0; i < 25; i++) {
            try {
              const updated = await withTimeout(
                prisma.page.update({
                  where: { workspaceId_slug: { workspaceId: guildId, slug: page.slug } },
                  data: { title: newTitle, slug },
                }),
                8000,
                "page-rename/update"
              );
              await refreshSearchVector(updated.id);
              const payload = await renderPageOpen(guildId, updated);
              return safeEdit(interaction, ephemeralPayload(payload));
            } catch (err) {
              if (err?.code === "P2002") {
                slug = `${baseSlug}-${i + 2}`;
                continue;
              }
              throw err;
            }
          }
          return safeEdit(interaction, ephemeralPayload({ content: "Could not rename (slug collision).", components: [] }));
        }

        const updated = await withTimeout(
          prisma.page.update({
            where: { workspaceId_slug: { workspaceId: guildId, slug: page.slug } },
            data: { title: newTitle },
          }),
          8000,
          "page-rename/update-keep"
        );
        await refreshSearchVector(updated.id);
        const payload = await renderPageOpen(guildId, updated);
        return safeEdit(interaction, ephemeralPayload(payload));
      }

      if (interaction.commandName === "page-move") {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        const query = interaction.options.getString("query", true);
        const folder = String(interaction.options.getString("folder", true)).trim().replace(/^\/+|\/+$/g, "");
        if (!folder) return safeEdit(interaction, ephemeralPayload({ content: "Folder cannot be empty.", components: [] }));

        const page = await findPageByQuery(guildId, query);
        if (!page) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));
        const newTitle = `${folder}/${page.title}`;
        const updated = await withTimeout(
          prisma.page.update({
            where: { workspaceId_slug: { workspaceId: guildId, slug: page.slug } },
            data: { title: newTitle.slice(0, 100) },
          }),
          8000,
          "page-move/update"
        );
        await refreshSearchVector(updated.id);
        const payload = await renderPageOpen(guildId, updated);
        return safeEdit(interaction, ephemeralPayload(payload));
      }

      if (interaction.commandName === "backlinks") {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        const query = interaction.options.getString("query", true);
        const target = await findPageByQuery(guildId, query);
        if (!target) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));

        const needles = [`[[${target.slug}]]`, `[[${target.title}]]`].filter(Boolean);
        const rows = await withTimeout(
          prisma.page.findMany({
            where: {
              workspaceId: guildId,
              OR: needles.map((n) => ({ contentMd: { contains: n } })),
            },
            orderBy: { updatedAt: "desc" },
            take: 25,
            select: { title: true, slug: true },
          }),
          8000,
          "backlinks/query"
        ).catch(() => []);

        if (!rows.length) return safeEdit(interaction, ephemeralPayload({ content: "No backlinks found.", components: [] }));

        
const lines = rows.map((r, i) => `${i + 1}. ${r.title} | ${r.slug}`);
const text = `Backlinks to ${target.title} (${target.slug})\n\n` + lines.join("\n");
return safeEdit(interaction, ephemeralPayload({ content: trimForDiscord(text, 1900), components: [] }));}

      if (interaction.commandName === "export") {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        const query = interaction.options.getString("query", true);
        const page = await findPageByQuery(guildId, query);
        if (!page) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));
        const md = (page.contentMd || "").trim();
        const content = `# ${page.title}

${md}`;
        return safeEdit(interaction, ephemeralPayload({ content: trimForDiscord(content, 1900), components: [] }));
      }

      if (interaction.commandName === "import") {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        const query = interaction.options.getString("query", true);
        const content = String(interaction.options.getString("content", true));
        const page = await findPageByQuery(guildId, query);
        if (!page) return safeEdit(interaction, ephemeralPayload({ content: "Page not found.", components: [] }));
        const updated = await withTimeout(
          prisma.page.update({
            where: { workspaceId_slug: { workspaceId: guildId, slug: page.slug } },
            data: { contentMd: content },
          }),
          8000,
          "import/update"
        );
        await refreshSearchVector(updated.id);
        const payload = await renderPageOpen(guildId, updated);
        return safeEdit(interaction, ephemeralPayload(payload));
      }

      if (
        interaction.commandName === "tag-add" ||
        interaction.commandName === "tag-remove" ||
        interaction.commandName === "tag-list" ||
        interaction.commandName === "search" ||
        interaction.commandName === "daily" ||
        interaction.commandName === "template-create" ||
        interaction.commandName === "template-use" ||
        interaction.commandName === "page-history" ||
        interaction.commandName === "page-rollback" ||
        interaction.commandName === "perm-set" ||
        interaction.commandName === "perm-list" ||
        interaction.commandName === "perm-clear"
      ) {
        if (!(await safeDeferReply(interaction, MessageFlags.Ephemeral))) return;
        return safeEdit(interaction, ephemeralPayload({ content: "This command is not implemented in this build.", components: [] }));
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