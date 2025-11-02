/*
  Warnings:

  - A unique constraint covering the columns `[shop,themeId]` on the table `shopThemeAssets` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "shopThemeAssets_shop_themeId_key" ON "shopThemeAssets"("shop", "themeId");
