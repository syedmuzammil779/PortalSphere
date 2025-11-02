/*
  Warnings:

  - You are about to drop the `ShopMetafieldUpdates` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "ShopMetafieldUpdates";

-- CreateTable
CREATE TABLE "ShopCSVPricingConfig" (
    "id" SERIAL NOT NULL,
    "shopId" BIGINT NOT NULL,
    "variantId" BIGINT NOT NULL,
    "groupName" TEXT,
    "type" TEXT,
    "minimum" INTEGER,
    "maximum" INTEGER,
    "increment" INTEGER,
    "priceConfig" JSONB NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShopCSVPricingConfig_pkey" PRIMARY KEY ("id")
);
