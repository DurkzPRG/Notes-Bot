# Discord Notes Bot

![Node](https://img.shields.io/badge/node-%3E%3D18-green)
![Discord.js](https://img.shields.io/badge/discord.js-v14-blue)
![Database](https://img.shields.io/badge/database-PostgreSQL-blue)
![ORM](https://img.shields.io/badge/ORM-Prisma-purple)
![Deploy](https://img.shields.io/badge/Deploy-Render-black)
![License](https://img.shields.io/badge/license-MIT-lightgrey)
![Status](https://img.shields.io/badge/status-active-success)

A structured, database-backed knowledge system for Discord.

Inspired by Notion and Obsidian, this bot transforms any Discord server
into a persistent workspace with pages, tags, templates, search, and
version history.

------------------------------------------------------------------------

## Tech Stack

-   Node.js 18+
-   Discord.js v14
-   PostgreSQL (Neon compatible)
-   Prisma ORM
-   Express (health server for Render)

------------------------------------------------------------------------

## Invite Bot link and Support Server

#### Here is the link to add the bot to your server: [BotLink](https://discord.com/oauth2/authorize?client_id=1474131071447863316). 
#### Join the bot’s support server if you have any questions: [BotDiscordServer](https://discord.gg/fqfrxsS5WN).
------------------------------------------------------------------------

## Features

### Pages

-   Create pages with markdown
-   Open by slug or title
-   Rename pages
-   Move into folders
-   Delete pages
-   Version history
-   Rollback support

### Organization

-   Tag system
-   Folder structure (via title prefix)
-   Templates
-   Daily notes
-   Backlinks using \[\[wikilinks\]\]

### Search

-   PostgreSQL full-text search
-   Indexed search vector updates
-   Filtered listing with pagination

### Stability & Safety

-   Ephemeral interaction responses
-   Query timeout protection
-   Auto workspace provisioning
-   Graceful shutdown handling
-   Render-compatible health server

------------------------------------------------------------------------

## Commands

### Core

-   /page-create
-   /page-open
-   /page-list
-   /page-rename
-   /page-move

### Tags

-   /tag-add
-   /tag-remove
-   /tag-list

### Search

-   /search

### Templates

-   /template-create
-   /template-use

### Version Control

-   /page-history
-   /page-rollback

### Permissions

-   /perm-set
-   /perm-list
-   /perm-clear

### Utilities

-   /daily
-   /export
-   /import
-   /backlinks
-   /help

------------------------------------------------------------------------

## Environment Variables

DISCORD_TOKEN= CLIENT_ID= DATABASE_URL= PORT=3000

------------------------------------------------------------------------

## Deployment

Compatible with:

-   Render
-   Railway
-   VPS
-   Docker
-   Any Node 18+ environment

Includes built-in health check endpoint:

GET / → 200 OK

------------------------------------------------------------------------

## License

MIT License
