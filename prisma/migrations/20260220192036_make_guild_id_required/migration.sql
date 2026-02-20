/*
  Warnings:

  - Made the column `guildId` on table `Workspace` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Workspace" ALTER COLUMN "guildId" SET NOT NULL;
