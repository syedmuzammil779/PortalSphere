-- AddForeignKey
ALTER TABLE "ShopSegmentsBuyers" ADD CONSTRAINT "ShopSegmentsBuyers_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "ShopSegmentsData"("id") ON DELETE SET NULL ON UPDATE CASCADE;
