-- CreateTable
CREATE TABLE "DashboardMetrics" (
    "id" BIGSERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "storeType" TEXT,
    "customerCount" INTEGER,
    "customersLastCounted" BIGINT,
    "customersCheckFrequency" INTEGER NOT NULL DEFAULT 1,
    "complementaryProductCounts" TEXT,
    "complementaryProductCountsLastChecked" BIGINT,
    "complementaryProductCountsFrequency" INTEGER NOT NULL DEFAULT 1,
    "groupCount" BIGINT,
    "groupCountLastChecked" BIGINT,
    "groupCountFrequency" INTEGER NOT NULL DEFAULT 1,
    "onlineStoreSetupStatus" TEXT,
    "onlineStoreSetupStatusLastChecked" BIGINT,
    "onlineStoreSetupStatusFrequency" INTEGER NOT NULL DEFAULT 1,
    "upsellTopProductsEnabled" TEXT,
    "upsellTopProductsEnabledLastChecked" BIGINT,
    "upsellTopProductsEnabledFrequency" INTEGER NOT NULL DEFAULT 1,
    "hasWholesalePortalAccessCount" BOOLEAN,
    "hasWholesalePortalAccessCountLastChecked" BIGINT,
    "hasWholesalePortalAccessCountFrequency" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "DashboardMetrics_pkey" PRIMARY KEY ("id")
);
