/*
  Warnings:

  - Added the required column `extraAssets` to the `shopThemeAssets` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "shopThemeAssets" ADD COLUMN "extraAssets" JSONB DEFAULT '[]'::jsonb;
