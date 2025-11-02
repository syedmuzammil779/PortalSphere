-- CreateTable
CREATE TABLE "ShopKlaviyoRecords" (
    "id" SERIAL NOT NULL,
    "shop" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "myshopifyDomain" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT false,
    "apiResponse" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ShopKlaviyoRecords_pkey" PRIMARY KEY ("id")
);
