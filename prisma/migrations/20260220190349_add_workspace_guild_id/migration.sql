/*
  Warnings:

  - A unique constraint covering the columns `[guildId]` on the table `Workspace` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "guildId" TEXT,
ADD COLUMN     "name" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_guildId_key" ON "Workspace"("guildId");
