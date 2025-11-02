/*
  Warnings:

  - A unique constraint covering the columns `[segmentId,customerId]` on the table `ShopSegmentsBuyers` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tag` to the `VolumePricingData` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "ShopSegmentsBuyers_segmentId_customerId_idx";

-- AlterTable
ALTER TABLE "ShopSegmentsBuyers" ADD COLUMN     "customerName" TEXT;

-- AlterTable
ALTER TABLE "VolumePricingData" ADD COLUMN     "tag" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "ShopSegmentsBuyers_segmentId_customerId_key" ON "ShopSegmentsBuyers"("segmentId", "customerId");

-- CreateIndex
CREATE INDEX "VolumePricingData_shop_tag_productVariantId_idx" ON "VolumePricingData"("shop", "tag", "productVariantId");

-- CreateIndex
CREATE INDEX "VolumePricingData_shop_tag_productVariantHandle_idx" ON "VolumePricingData"("shop", "tag", "productVariantHandle");
