-- AlterTable
ALTER TABLE "ResponseSet" ADD COLUMN     "clientSubmissionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ResponseSet_clientSubmissionId_key" ON "ResponseSet"("clientSubmissionId");
