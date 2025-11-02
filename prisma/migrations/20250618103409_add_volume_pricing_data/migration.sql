-- CreateTable
CREATE TABLE "VolumePricingData" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "productVariantHandle" TEXT,
    "returnData" JSONB NOT NULL,

    CONSTRAINT "VolumePricingData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VolumePricingData_shop_customerId_productVariantId_idx" ON "VolumePricingData"("shop", "customerId", "productVariantId");

-- CreateIndex
CREATE INDEX "VolumePricingData_shop_customerId_productVariantHandle_idx" ON "VolumePricingData"("shop", "customerId", "productVariantHandle");
