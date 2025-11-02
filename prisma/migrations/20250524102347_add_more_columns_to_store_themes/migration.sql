-- AlterTable
ALTER TABLE "shopThemeAssets" ADD COLUMN     "role" TEXT,
ADD COLUMN     "schemaName" TEXT,
ADD COLUMN     "status" BOOLEAN NOT NULL DEFAULT false;
