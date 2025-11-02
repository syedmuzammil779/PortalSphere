-- CreateTable
CREATE TABLE "ShopSegmentsData" (
    "id" BIGSERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "segmentName" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "query" TEXT,
    "defaultDiscount" TEXT,
    "defaultMOQ" TEXT,
    "paymentMethods" TEXT,
    "buyerCount" TEXT,
    "tagID" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ShopSegmentsData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSegmentsData_shop_segmentName_key" ON "ShopSegmentsData"("shop", "segmentName");
