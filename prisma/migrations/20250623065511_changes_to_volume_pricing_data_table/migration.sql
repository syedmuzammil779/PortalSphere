/*
  Warnings:

  - You are about to drop the column `customerId` on the `VolumePricingData` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "VolumePricingData_shop_customerId_productVariantHandle_idx";

-- DropIndex
DROP INDEX "VolumePricingData_shop_customerId_productVariantId_idx";

-- AlterTable
ALTER TABLE "VolumePricingData" DROP COLUMN "customerId";
