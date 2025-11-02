-- CreateTable
CREATE TABLE "ButtonClicks" (
    "id" BIGSERIAL NOT NULL,
    "shopId" BIGINT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tag" TEXT,
    "buttonType" TEXT,
    "operation" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ButtonClicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrders" (
    "id" BIGSERIAL NOT NULL,
    "shopId" BIGINT NOT NULL,
    "shopifyId" BIGINT NOT NULL,
    "graphQLId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "subtotalPrice" TEXT,
    "currency" TEXT,
    "fulfillmentStatus" TEXT,
    "financialStatus" TEXT,
    "checkoutId" TEXT,
    "checkoutToken" TEXT,
    "tags" TEXT,
    "totalPrice" TEXT,
    "discounts" JSONB NOT NULL,
    "billingAddress" JSONB NOT NULL,
    "shippingAddress" JSONB NOT NULL,
    "customer" JSONB NOT NULL,
    "paymentTerms" JSONB NOT NULL,
    "createdAt" TEXT,
    "updatedAt" TEXT,

    CONSTRAINT "ShopOrders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrderLineItems" (
    "id" BIGSERIAL NOT NULL,
    "orderId" BIGINT,
    "shopifyId" BIGINT,
    "productId" BIGINT,
    "variantId" BIGINT,
    "quantity" BIGINT,
    "price" TEXT,
    "createdAt" TEXT,
    "updatedAt" TEXT,
    "discounts" JSONB NOT NULL,
    "customerName" TEXT,

    CONSTRAINT "ShopOrderLineItems_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ButtonClicks_shopId_customerId_idx" ON "ButtonClicks"("shopId", "customerId");

-- CreateIndex
CREATE INDEX "ShopOrders_shopId_name_idx" ON "ShopOrders"("shopId", "name");

-- CreateIndex
CREATE INDEX "ShopOrders_shopId_updatedAt_idx" ON "ShopOrders"("shopId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrders_shopId_shopifyId_key" ON "ShopOrders"("shopId", "shopifyId");

-- CreateIndex
CREATE INDEX "ShopOrderLineItems_orderId_productId_idx" ON "ShopOrderLineItems"("orderId", "productId");

-- CreateIndex
CREATE INDEX "ShopOrderLineItems_orderId_variantId_idx" ON "ShopOrderLineItems"("orderId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrderLineItems_orderId_shopifyId_key" ON "ShopOrderLineItems"("orderId", "shopifyId");

-- AddForeignKey
ALTER TABLE "ShopOrderLineItems" ADD CONSTRAINT "ShopOrderLineItems_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ShopOrders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
