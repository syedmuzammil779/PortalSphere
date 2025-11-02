-- CreateTable
CREATE TABLE "ShopMetafieldUpdates" (
    "table_id" SERIAL NOT NULL,
    "id" INTEGER,
    "shop" TEXT NOT NULL,
    "key" TEXT,
    "title" TEXT,
    "variant" TEXT,
    "retail_price" TEXT,
    "absolute_retail_price" TEXT,
    "absolute_wholesale_price" TEXT,
    "wholesale_price" TEXT,
    "tag" TEXT,
    "sku" TEXT,
    "price_type" TEXT,
    "handle" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT false,
    "updatePayload" TEXT,
    "updateResponse" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ShopMetafieldUpdates_pkey" PRIMARY KEY ("table_id")
);
