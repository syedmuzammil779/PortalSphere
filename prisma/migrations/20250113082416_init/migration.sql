-- CreateTable
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ComplementaryProducts" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "complementaryProductVariantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplementaryProducts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GroupPriceConfig" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPriceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StoreSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "configType" TEXT NOT NULL,
    "configName" TEXT NOT NULL,
    "configValue" TEXT NOT NULL,

    CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WholesalePricingBuyers" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "companyAddress" TEXT NOT NULL,
    "contactFirstName" TEXT NOT NULL,
    "contactLastName" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "buyerType" TEXT NOT NULL,
    "locationCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shopifyCustomerId" TEXT,

    CONSTRAINT "WholesalePricingBuyers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProductVolumePriceConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "discountId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "volume_config" TEXT NOT NULL,
    "price_config" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVolumePriceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaidOrder" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "orderTotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "transactionMonth" INTEGER NOT NULL,
    "transactionYear" INTEGER NOT NULL,

    CONSTRAINT "PaidOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StoreUsageBillingInfo" (
    "id" BIGSERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "lastChecked" TEXT NOT NULL,
    "paymentFlag" SMALLINT NOT NULL,
    "apiResponse" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "StoreUsageBillingInfo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StoreSubscriptionInfo" (
    "id" BIGSERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "currentTier" TEXT NOT NULL,
    "totalEarnings" TEXT NOT NULL,
    "upsellEarnings" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "StoreSubscriptionInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ComplementaryProducts_id_key" ON "ComplementaryProducts"("id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WholesalePricingBuyers_id_key" ON "WholesalePricingBuyers"("id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AppSettings_id_key" ON "AppSettings"("id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVolumePriceConfig_id_key" ON "ProductVolumePriceConfig"("id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVolumePriceConfig_productId_discountId_key" ON "ProductVolumePriceConfig"("productId", "discountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaidOrder_id_key" ON "PaidOrder"("id");
