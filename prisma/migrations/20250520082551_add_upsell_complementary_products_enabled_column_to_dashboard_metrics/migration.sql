-- AlterTable
ALTER TABLE "DashboardMetrics" ADD COLUMN     "upsellComplementaryProductsEnabled" TEXT,
ADD COLUMN     "upsellComplementaryProductsEnabledFrequency" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "upsellComplementaryProductsEnabledLastChecked" BIGINT;
