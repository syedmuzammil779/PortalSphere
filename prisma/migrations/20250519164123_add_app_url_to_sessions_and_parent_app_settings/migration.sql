-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "appUrl" TEXT;

-- CreateTable
CREATE TABLE "ParentAppSettings" (
    "id" BIGSERIAL NOT NULL,
    "appUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "ParentAppSettings_pkey" PRIMARY KEY ("id")
);
