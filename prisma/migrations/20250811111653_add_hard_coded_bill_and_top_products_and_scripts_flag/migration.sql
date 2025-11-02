-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "fixedBillAmount" INTEGER,
ADD COLUMN     "scriptsFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "topProductsFlag" BOOLEAN NOT NULL DEFAULT false;
