-- CreateTable
CREATE TABLE "WebhookJobs" (
    "id" SERIAL NOT NULL,
    "shop" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "WebhookJobs_pkey" PRIMARY KEY ("id")
);
