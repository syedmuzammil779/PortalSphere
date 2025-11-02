/*
  Warnings:

  - A unique constraint covering the columns `[shop,shopifyOrderId]` on the table `ShopNetTermsOrdersToDraftOrders` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "ShopNetTermsOrdersToDraftOrders_shop_shopifyOrderId_key" ON "ShopNetTermsOrdersToDraftOrders"("shop", "shopifyOrderId");
