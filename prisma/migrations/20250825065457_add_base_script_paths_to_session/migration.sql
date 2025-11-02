/*
  Warnings:

  - Made the column `extraAssets` on table `shopThemeAssets` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "baseScriptFolder" TEXT NOT NULL DEFAULT 'default',
ADD COLUMN     "baseScriptPath" TEXT NOT NULL DEFAULT 'main';

-- AlterTable
ALTER TABLE "shopThemeAssets" ALTER COLUMN "extraAssets" SET NOT NULL,
ALTER COLUMN "extraAssets" DROP DEFAULT;
