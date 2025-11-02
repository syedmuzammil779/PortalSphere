-- AlterTable
ALTER TABLE "DashboardMetrics" ADD COLUMN     "unsetTopProductsCount" INTEGER,
ADD COLUMN     "unsetTopProductsCountFrequency" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "unsetTopProductsCountLastChecked" BIGINT;
