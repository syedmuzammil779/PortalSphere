/*
  Warnings:

  - A unique constraint covering the columns `[shop,webhookId]` on the table `WebhookJobs` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `webhookId` to the `WebhookJobs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "WebhookJobs" ADD COLUMN     "webhookId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "WebhookJobs_shop_webhookId_key" ON "WebhookJobs"("shop", "webhookId");
