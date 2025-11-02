-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "appSettingsFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "compProductsFlag" BOOLEAN NOT NULL DEFAULT false;
