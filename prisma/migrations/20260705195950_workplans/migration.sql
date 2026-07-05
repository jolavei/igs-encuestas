/*
  Warnings:

  - You are about to drop the column `assignmentId` on the `ResponseSet` table. All the data in the column will be lost.
  - You are about to drop the `Assignment` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_locationId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_questionnaireId_fkey";

-- DropForeignKey
ALTER TABLE "Assignment" DROP CONSTRAINT "Assignment_surveyorId_fkey";

-- DropForeignKey
ALTER TABLE "ResponseSet" DROP CONSTRAINT "ResponseSet_assignmentId_fkey";

-- AlterTable
ALTER TABLE "ResponseSet" DROP COLUMN "assignmentId",
ADD COLUMN     "segmentValue" TEXT,
ADD COLUMN     "workPlanId" TEXT;

-- DropTable
DROP TABLE "Assignment";

-- CreateTable
CREATE TABLE "WorkPlan" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "locationId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "totalTarget" INTEGER NOT NULL DEFAULT 0,
    "segmentKey" TEXT,
    "segmentLabel" TEXT,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkPlanSegment" (
    "id" TEXT NOT NULL,
    "workPlanId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "target" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WorkPlanSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_WorkPlanSurveyors" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "WorkPlan_companyId_idx" ON "WorkPlan"("companyId");

-- CreateIndex
CREATE INDEX "WorkPlan_questionnaireId_idx" ON "WorkPlan"("questionnaireId");

-- CreateIndex
CREATE INDEX "WorkPlanSegment_workPlanId_idx" ON "WorkPlanSegment"("workPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "_WorkPlanSurveyors_AB_unique" ON "_WorkPlanSurveyors"("A", "B");

-- CreateIndex
CREATE INDEX "_WorkPlanSurveyors_B_index" ON "_WorkPlanSurveyors"("B");

-- CreateIndex
CREATE INDEX "ResponseSet_workPlanId_idx" ON "ResponseSet"("workPlanId");

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "Questionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlan" ADD CONSTRAINT "WorkPlan_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkPlanSegment" ADD CONSTRAINT "WorkPlanSegment_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResponseSet" ADD CONSTRAINT "ResponseSet_workPlanId_fkey" FOREIGN KEY ("workPlanId") REFERENCES "WorkPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkPlanSurveyors" ADD CONSTRAINT "_WorkPlanSurveyors_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_WorkPlanSurveyors" ADD CONSTRAINT "_WorkPlanSurveyors_B_fkey" FOREIGN KEY ("B") REFERENCES "WorkPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
