-- AlterTable
ALTER TABLE "shopThemeAssets" ADD COLUMN     "cpBlockFlag" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ppEmbedFlag" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pptBlockFlag" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tpEmbedBlockFlag" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tspEmbedBlockFlag" BOOLEAN NOT NULL DEFAULT true;
