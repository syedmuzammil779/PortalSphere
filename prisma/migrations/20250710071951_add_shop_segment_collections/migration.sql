-- CreateTable
CREATE TABLE "ShopSegmentCollections" (
    "id" BIGSERIAL NOT NULL,
    "segmentId" BIGINT NOT NULL,
    "collectionId" BIGINT NOT NULL,
    "discount_type" TEXT,
    "priceConfig" JSONB NOT NULL,
    "volumeConfig" JSONB NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ShopSegmentCollections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopSegmentCollections_segmentId_collectionId_key" ON "ShopSegmentCollections"("segmentId", "collectionId");

-- AddForeignKey
ALTER TABLE "ShopSegmentCollections" ADD CONSTRAINT "ShopSegmentCollections_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "ShopSegmentsData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
