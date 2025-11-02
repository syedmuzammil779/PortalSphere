-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "table_id" BIGSERIAL NOT NULL;

-- CreateTable
CREATE TABLE "ShopSegmentVariants" (
    "id" BIGSERIAL NOT NULL,
    "segmentId" BIGINT NOT NULL,
    "variantId" BIGINT NOT NULL,
    "discount_type" TEXT,
    "priceConfig" JSONB NOT NULL,
    "volumeConfig" JSONB NOT NULL,

    CONSTRAINT "ShopSegmentVariants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopProducts" (
    "id" BIGSERIAL NOT NULL,
    "storeId" BIGINT NOT NULL,
    "productId" BIGINT NOT NULL,
    "title" TEXT,
    "price" TEXT,
    "handle" TEXT,
    "productType" TEXT,
    "status" TEXT,
    "tags" TEXT,
    "totalInventory" INTEGER,
    "tracksInventory" BOOLEAN NOT NULL DEFAULT true,
    "variantsCount" INTEGER,
    "vendor" TEXT,

    CONSTRAINT "ShopProducts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopVariants" (
    "id" BIGSERIAL NOT NULL,
    "storeId" BIGINT NOT NULL,
    "productId" BIGINT NOT NULL,
    "variantId" BIGINT NOT NULL,
    "compareAtPrice" TEXT,
    "title" TEXT,
    "displayName" TEXT,
    "inventoryPolicy" TEXT,
    "inventoryQuantity" INTEGER,
    "price" TEXT,
    "sku" TEXT,
    "unitPrice" TEXT,

    CONSTRAINT "ShopVariants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSegmentVariants_segmentId_variantId_key" ON "ShopSegmentVariants"("segmentId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopProducts_productId_storeId_key" ON "ShopProducts"("productId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopVariants_storeId_productId_variantId_key" ON "ShopVariants"("storeId", "productId", "variantId");

-- AddForeignKey
ALTER TABLE "ShopSegmentVariants" ADD CONSTRAINT "ShopSegmentVariants_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "ShopSegmentsData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopVariants" ADD CONSTRAINT "ShopVariants_productId_storeId_fkey" FOREIGN KEY ("productId", "storeId") REFERENCES "ShopProducts"("productId", "storeId") ON DELETE RESTRICT ON UPDATE CASCADE;
