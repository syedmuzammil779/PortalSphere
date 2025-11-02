-- CreateTable
CREATE TABLE "shopThemeAssets" (
    "id" BIGSERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "themeName" TEXT,
    "themeId" TEXT,
    "mainJs" TEXT NOT NULL DEFAULT 'app-extensions-globals.js',
    "ppEmbedBlock" TEXT,
    "cpBlock" TEXT,
    "pptBlock" TEXT,
    "tpEmbedBlock" TEXT,
    "tspEmbedBlock" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "shopThemeAssets_pkey" PRIMARY KEY ("id")
);
