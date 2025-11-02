-- CreateTable
CREATE TABLE "ShopSegmentsBuyers" (
    "id" BIGSERIAL NOT NULL,
    "segmentId" BIGINT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ShopSegmentsBuyers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopSegmentsBuyers_segmentId_customerId_idx" ON "ShopSegmentsBuyers"("segmentId", "customerId");
