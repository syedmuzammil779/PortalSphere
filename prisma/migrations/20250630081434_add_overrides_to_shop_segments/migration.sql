/*
  Warnings:

  - Added the required column `collectionDiscounts` to the `ShopSegmentsData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `productDiscounts` to the `ShopSegmentsData` table without a default value. This is not possible if the table is not empty.
  - Added the required column `storeDiscounts` to the `ShopSegmentsData` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ShopSegmentsData" ADD COLUMN "collectionDiscounts" JSONB NOT NULL default '{}',
ADD COLUMN "productDiscounts" JSONB NOT NULL default '{}',
ADD COLUMN "storeDiscounts" JSONB NOT NULL default '{}';
