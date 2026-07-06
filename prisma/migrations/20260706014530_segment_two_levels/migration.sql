-- AlterTable
ALTER TABLE "ResponseSet" ADD COLUMN     "segmentValue2" TEXT;

-- AlterTable
ALTER TABLE "WorkPlan" ADD COLUMN     "segment2Key" TEXT,
ADD COLUMN     "segment2Label" TEXT;

-- AlterTable
ALTER TABLE "WorkPlanSegment" ADD COLUMN     "parentValue" TEXT;
