import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} from "discord.js";
import { PrismaClient, Prisma } from "@prisma/client";

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.get("/", (req, res) => res.status(200).send("OK"));
app.listen(PORT, "0.0.0.0", () => console.log("Health server up on port", PORT));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const prisma = new PrismaClient();

function slugify(title) {
  return (title || "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function normalizeBaseSlug(title) {
  const s = slugify(title);
  return s.length ? s : "page";
}

async function makeUniqueSlug(prismaClient, workspaceId, title) {
  const base = normalizeBaseSlug(title);

  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;

    const exists = await prismaClient.page.findUnique({
      where: { workspaceId_slug: { workspaceId, slug: candidate } },
      select: { id: true },
    });

    if (!exists) return candidate;
  }

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
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

function parseTagsCsv(s) {
  return (s || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => t.replace(/^#/, ""))
    .filter((t) => /^[a-z0-9_-]{1,32}$/.test(t));
}

function splitHeaderAndBody(contentMd) {
  const raw = contentMd || "";
  const lines = raw.split("\n");
  if (!lines.length) return { tags: [], body: "" };
  const first = lines[0].trim();
  if (!first.toLowerCase().startsWith("tags:")) return { tags: [], body: raw };
  const tagPart = first.slice(5).trim();
  const tags = tagPart
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .map((t) => t.replace(/^#/, ""))
    .filter((t) => /^[a-z0-9_-]{1,32}$/.test(t));
  const body = lines.slice(1).join("\n").replace(/^\n+/, "");
  return { tags, body };
}

function buildContentWithTags(tags, body) {
  const cleanTags = Array.from(new Set((tags || []).map((t) => (t || "").toLowerCase().replace(/^#/, "")))).filter((t) =>
    /^[a-z0-9_-]{1,32}$/.test(t)
  );
  const header = cleanTags.length ? `tags: ${cleanTags.join(", ")}` : "";
  const b = (body || "").replace(/^\n+/, "");
  if (!header) return b;
  if (!b) return header;
  return `${header}\n\n${b}`;
}

function folderizeTitle(title, folder) {
  const f = (folder || "").trim().replace(/^[\/]+|[\/]+$/g, "");
  const t = (title || "").trim();
  if (!f) return t;
  const clean = t.replace(/^\[[^\]]+\]\s*/, "");
  return `[${f}] ${clean}`;
}

function parseFolderFromTitle(title) {
  const m = (title || "").trim().match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { folder: "", cleanTitle: (title || "").trim() };
  return { folder: m[1].trim(), cleanTitle: (m[2] || "").trim() };
}

async function safeRespond(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch {
    return null;
  }
}

async function ensureDeferred(interaction) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true });
    }
    return true;
  } catch {
    return false;
  }
}

async function ensureWorkspace(workspaceId) {
  try {
    await prisma.workspace.upsert({
      where: { id: workspaceId },
      update: {},
      create: { id: workspaceId },
    });
  } catch {}
}

async function findPageByQuery(workspaceId, query) {
  const q = (query || "").trim();
  const slug = looksLikeSlug(q) ? q.toLowerCase() : slugify(q);

  const bySlug = await prisma.page.findUnique({
    where: { workspaceId_slug: { workspaceId, slug } },
  });
  if (bySlug) return { page: bySlug, slug: bySlug.slug };

  const byTitle = await prisma.page.findFirst({
    where: { workspaceId, title: { equals: q, mode: "insensitive" } },
  });

  return { page: byTitle, slug: byTitle?.slug || slug };
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

function nowDateIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

function memberRoleIds(interaction) {
  const roles = interaction.member?.roles;
  if (!roles) return [];
  if (Array.isArray(roles)) return roles.map(String);
  if (roles.cache) return Array.from(roles.cache.keys()).map(String);
  return [];
}

async function workspaceHasAnyPerms(workspaceId, pageId) {
  const count = await prisma.permissionRule.count({
    where: { workspaceId, OR: [{ pageId: null }, { pageId }] },
  });
  return count > 0;
}

function ruleMatches(rule, roleIds, channelId) {
  if (!roleIds.includes(String(rule.roleId))) return false;
  if (rule.channelId && String(rule.channelId) !== String(channelId)) return false;
  return true;
}

async function canRead(interaction, workspaceId, pageId) {
  if (isAdmin(interaction)) return true;
  const hasAny = await workspaceHasAnyPerms(workspaceId, pageId);
  if (!hasAny) return true;
  const roleIds = memberRoleIds(interaction);
  const rules = await prisma.permissionRule.findMany({
    where: { workspaceId, OR: [{ pageId }, { pageId: null }] },
  });
  return rules.some((r) => r.canRead && ruleMatches(r, roleIds, interaction.channelId));
}

async function canWrite(interaction, workspaceId, pageId) {
  if (isAdmin(interaction)) return true;
  const hasAny = await workspaceHasAnyPerms(workspaceId, pageId);
  if (!hasAny) return true;
  const roleIds = memberRoleIds(interaction);
  const rules = await prisma.permissionRule.findMany({
    where: { workspaceId, OR: [{ pageId }, { pageId: null }] },
  });
  return rules.some((r) => r.canWrite && ruleMatches(r, roleIds, interaction.channelId));
}

async function saveVersionBeforeChange(page, authorId) {
  await prisma.pageVersion.create({
    data: {
      pageId: page.id,
      version: page.version,
      title: page.title,
      slug: page.slug,
      contentMd: page.contentMd || "",
      authorId: authorId ? String(authorId) : null,
    },
  });
}

async function bumpVersion(pageId) {
  await prisma.page.update({
    where: { id: pageId },
    data: { version: { increment: 1 } },
  });
}

async function refreshSearchVector(pageId) {
  try {
    await prisma.$executeRaw(
      Prisma.sql`UPDATE "Page" SET "searchVector" = to_tsvector('simple', coalesce("title",'') || ' ' || coalesce("contentMd",'')) WHERE "id" = ${pageId}`
    );
  } catch {}
}

async function renderPageOpen(workspaceId, page) {
  const { folder } = parseFolderFromTitle(page.title);
  const { tags, body } = splitHeaderAndBody(page.contentMd || "");
  const meta = [
    folder ? `folder: ${folder}` : null,
    tags.length ? `tags: ${tags.map((t) => `#${t}`).join(" ")}` : null,
    `version: ${page.version}`,
    `updated: ${new Date(page.updatedAt).toISOString().slice(0, 19).replace("T", " ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const content = body?.length ? body : "(empty)";
  const text = `${page.title} (slug: ${page.slug})\n${meta ? `\n${meta}\n` : "\n"}\n${content}`;

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
            { slug: { contains: s.toLowerCase(), mode: "insensitive" } },
            { contentMd: { contains: s, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.page.count({ where }),
    prisma.page.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip,
      take,
      select: { title: true, slug: true, updatedAt: true, id: true },
    }),
  ]);

  if (total === 0) {
    return safeRespond(interaction, {
      content: s ? "No pages found for that search." : "No pages yet.",
      components: [],
    });
  }

  const visible = [];
  for (const r of rows) {
    if (await canRead(interaction, workspaceId, r.id)) visible.push(r);
  }

  const totalPages = Math.max(1, Math.ceil(total / take));
  const current = clampInt(p, 1, totalPages);
  const start = (current - 1) * take;
  const end = Math.min(total, start + rows.length);

  const header = `Pages ${start + 1}-${end} of ${total} (page ${current}/${totalPages})` + (s ? ` | search: ${s}` : "");
  const lines = visible.map((r, i) => `${start + i + 1}. ${r.title}  |  ${r.slug}`);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(makeListKey(workspaceId, s, Math.max(1, current - 1)))
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current <= 1),
    new ButtonBuilder()
      .setCustomId(makeListKey(workspaceId, s, Math.min(totalPages, current + 1)))
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(current >= totalPages)
  );

  return safeRespond(interaction, {
    content: trimForDiscord(`${header}\n\n${lines.join("\n") || "(no visible pages)"}`, 1900),
    components: [row],
  });
}

function helpText() {
  return trimForDiscord(
    [
      "Commands",
      "",
      "/help",
      "Shows this message.",
      "",
      "/page-create title content",
      "Creates a page. Content is markdown.",
      "",
      "/page-open query",
      "Opens a page by slug (recommended) or exact title. Includes buttons: Edit / Delete / Refresh.",
      "",
      "/page-list search",
      "Lists pages (newest first). Use buttons for Previous/Next.",
      "",
      "/page-rename query title keep_slug",
      "Renames a page. If keep_slug is false, a new unique slug is generated.",
      "",
      "/page-move query folder",
      "Moves a page into a folder by prefixing the title like [folder] Title.",
      "",
      "/tag-add query tags",
      "Adds tags. Tags are stored in the first line as: tags: a, b, c",
      "",
      "/tag-remove query tags",
      "Removes tags.",
      "",
      "/tag-list search",
      "Lists server tags and their usage counts.",
      "",
      "/search q",
      "Full-text search using Postgres tsvector ranking.",
      "",
      "/daily date",
      "Creates/opens the daily note (Daily YYYY-MM-DD).",
      "",
      "/template-create name content",
      "Creates/updates a template.",
      "",
      "/template-use name title",
      "Creates a new page using a template content.",
      "",
      "/backlinks query",
      "Finds pages that reference [[slug]] or [[Title]].",
      "",
      "/page-history query limit",
      "Shows version history (snapshots saved before edits).",
      "",
      "/page-rollback query version",
      "Rolls back to a previous version number.",
      "",
      "/export query",
      "Exports a page as markdown text.",
      "",
      "/import query content",
      "Overwrites a page content with markdown.",
      "",
      "/perm-set query role_id channel_id read write",
      "Sets allow rules for a role. If any rules exist, pages become allow-list based for that page/workspace. Optional channel_id restricts to that channel. query is optional (workspace-wide rule if omitted).",
      "",
      "/perm-list query",
      "Lists permission rules. query optional.",
      "",
      "/perm-clear query",
      "Clears permission rules. query optional.",
    ].join("\n"),
    1900
  );
}

let didReadyLog = false;
function onReady() {
  if (didReadyLog) return;
  didReadyLog = true;
  console.log(`Bot online como ${client.user?.tag}`);
}
client.once("ready", onReady);
client.once("clientReady", onReady);

client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    const guildId = interaction.guildId;
    if (!guildId) return;
    const focused = interaction.options.getFocused(true);
    if (focused.name !== "query") return;

    const q = (focused.value || "").trim();
    const rows = await prisma.page.findMany({
      where: {
        workspaceId: guildId,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { slug: { contains: slugify(q), mode: "insensitive" } },
                { slug: { contains: q.toLowerCase(), mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { title: true, slug: true, id: true },
    });

    const visible = [];
    for (const r of rows) {
      if (await canRead(interaction, guildId, r.id)) visible.push(r);
    }

    const choices = visible.slice(0, 20).map((r) => ({
      name: `${r.title} (${r.slug})`.slice(0, 100),
      value: r.slug,
    }));

    try {
      await interaction.respond(choices);
    } catch {}
    return;
  }

  if (interaction.isButton()) {
    const guildId = interaction.guildId;
    if (!guildId) return;

    if (interaction.customId.startsWith("pl|")) {
      const parsed = parseListKey(interaction.customId);
      if (!parsed) return;
      if (!(await ensureDeferred(interaction))) return;
      if (parsed.workspaceId !== guildId) return safeRespond(interaction, { content: "Invalid action.", components: [] });
      return runPageList(interaction, guildId, parsed.search, parsed.pageNum);
    }

    if (interaction.customId.startsWith("po|")) {
      const parsed = parseOpenKey(interaction.customId);
      if (!parsed) return;
      if (!(await ensureDeferred(interaction))) return;
      if (parsed.workspaceId !== guildId) return safeRespond(interaction, { content: "Invalid action.", components: [] });

      const page = await prisma.page.findUnique({
        where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } },
      });
      if (!page) return safeRespond(interaction, { content: "Page not found.", components: [] });
      if (!(await canRead(interaction, guildId, page.id))) return safeRespond(interaction, { content: "No permission.", components: [] });

      const payload = await renderPageOpen(guildId, page);
      return safeRespond(interaction, payload);
    }

    if (interaction.customId.startsWith("pe|")) {
      const parsed = parseKey3("pe", interaction.customId);
      if (!parsed) return;

      const page = await prisma.page.findUnique({
        where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } },
      });

      if (!page) return interaction.reply({ content: "Page not found.", ephemeral: true }).catch(() => {});
      if (!(await canWrite(interaction, guildId, page.id))) return interaction.reply({ content: "No permission.", ephemeral: true }).catch(() => {});

      const { body } = splitHeaderAndBody(page.contentMd || "");
      const modal = new ModalBuilder().setCustomId(modalEditId(guildId, page.slug)).setTitle(`Edit: ${page.slug}`.slice(0, 45));
      const input = new TextInputBuilder()
        .setCustomId("content")
        .setLabel("Content (markdown)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setValue((body || "").slice(0, 4000));
      modal.addComponents(new ActionRowBuilder().addComponents(input));
      return interaction.showModal(modal).catch(() => {});
    }

    if (interaction.customId.startsWith("pd|")) {
      const parsed = parseKey3("pd", interaction.customId);
      if (!parsed) return;
      if (!(await ensureDeferred(interaction))) return;
      if (parsed.workspaceId !== guildId) return safeRespond(interaction, { content: "Invalid action.", components: [] });

      const page = await prisma.page.findUnique({
        where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } },
      });
      if (!page) return safeRespond(interaction, { content: "Page not found.", components: [] });
      if (!(await canWrite(interaction, guildId, page.id))) return safeRespond(interaction, { content: "No permission.", components: [] });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(delConfirmKey(guildId, page.slug)).setLabel("Confirm").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(openKey(guildId, page.slug)).setLabel("Cancel").setStyle(ButtonStyle.Secondary)
      );

      return safeRespond(interaction, { content: `Delete: ${page.title} (slug: ${page.slug})`, components: [row] });
    }

    if (interaction.customId.startsWith("pdc|")) {
      const parsed = parseKey3("pdc", interaction.customId);
      if (!parsed) return;
      if (!(await ensureDeferred(interaction))) return;
      if (parsed.workspaceId !== guildId) return safeRespond(interaction, { content: "Invalid action.", components: [] });

      const page = await prisma.page.findUnique({
        where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } },
      });
      if (!page) return safeRespond(interaction, { content: "Page not found.", components: [] });
      if (!(await canWrite(interaction, guildId, page.id))) return safeRespond(interaction, { content: "No permission.", components: [] });

      await saveVersionBeforeChange(page, interaction.user?.id);
      await prisma.page.delete({ where: { id: page.id } });

      return safeRespond(interaction, { content: `Deleted: ${page.title} (slug: ${page.slug})`, components: [] });
    }

    return;
  }

  if (interaction.isModalSubmit()) {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const parsed = parseModalEditId(interaction.customId);
    if (!parsed) return;

    if (!(await ensureDeferred(interaction))) return;
    if (parsed.workspaceId !== guildId) return safeRespond(interaction, { content: "Invalid action.", components: [] });

    const page = await prisma.page.findUnique({
      where: { workspaceId_slug: { workspaceId: guildId, slug: parsed.slug } },
    });
    if (!page) return safeRespond(interaction, { content: "Page not found.", components: [] });
    if (!(await canWrite(interaction, guildId, page.id))) return safeRespond(interaction, { content: "No permission.", components: [] });

    const newBody = interaction.fields.getTextInputValue("content") || "";
    const { tags } = splitHeaderAndBody(page.contentMd || "");
    const merged = buildContentWithTags(tags, newBody);

    await saveVersionBeforeChange(page, interaction.user?.id);

    await prisma.page.update({ where: { id: page.id }, data: { contentMd: merged } });
    await bumpVersion(page.id);

    const fresh = await prisma.page.findUnique({ where: { id: page.id } });
    if (fresh) await refreshSearchVector(fresh.id);

    const payload = await renderPageOpen(guildId, fresh || page);
    return safeRespond(interaction, payload);
  }

  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;
  if (!guildId) return safeRespond(interaction, { content: "This command only works inside a server.", ephemeral: true });

  if (!(await ensureDeferred(interaction))) return;

  await ensureWorkspace(guildId);

  try {
    if (interaction.commandName === "help") {
      return safeRespond(interaction, { content: helpText(), components: [] });
    }

    if (interaction.commandName === "page-create") {
      const title = interaction.options.getString("title", true);
      const content = interaction.options.getString("content") ?? "";
      const slug = await makeUniqueSlug(prisma, guildId, title);

      const page = await prisma.page.create({ data: { workspaceId: guildId, title, slug, contentMd: content } });

      if (!(await canWrite(interaction, guildId, page.id))) {
        await prisma.page.delete({ where: { id: page.id } });
        return safeRespond(interaction, { content: "No permission.", components: [] });
      }

      await refreshSearchVector(page.id);
      const payload = await renderPageOpen(guildId, page);
      return safeRespond(interaction, payload);
    }

    if (interaction.commandName === "page-open") {
      const query = interaction.options.getString("query", true);
      const { page } = await findPageByQuery(guildId, query);
      if (!page) return safeRespond(interaction, { content: "Page not found.", components: [] });
      if (!(await canRead(interaction, guildId, page.id))) return safeRespond(interaction, { content: "No permission.", components: [] });
      const payload = await renderPageOpen(guildId, page);
      return safeRespond(interaction, payload);
    }

    if (interaction.commandName === "page-list") {
      const search = interaction.options.getString("search") ?? "";
      return runPageList(interaction, guildId, search, 1);
    }

    return safeRespond(interaction, { content: "Unknown command.", components: [] });
  } catch {
    return safeRespond(interaction, { content: "Command error.", components: [] });
  }
});

process.on("unhandledRejection", () => {});
process.on("uncaughtException", () => {});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
