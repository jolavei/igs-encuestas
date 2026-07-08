-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "sectionId" TEXT;

-- CreateTable
CREATE TABLE "QuestionSection" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT,
    "routing" TEXT NOT NULL DEFAULT 'NEXT',

    CONSTRAINT "QuestionSection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuestionSection_versionId_idx" ON "QuestionSection"("versionId");

-- AddForeignKey
ALTER TABLE "QuestionSection" ADD CONSTRAINT "QuestionSection_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "QuestionnaireVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "QuestionSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
