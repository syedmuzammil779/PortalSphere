-- CreateTable
CREATE TABLE "ShopNetTermsOrdersToDraftOrders" (
    "id" SERIAL NOT NULL,
    "shop" TEXT,
    "shopifyOrderId" TEXT,
    "draftOrderId" TEXT,
    "draftOrderResp" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ShopNetTermsOrdersToDraftOrders_pkey" PRIMARY KEY ("id")
);
