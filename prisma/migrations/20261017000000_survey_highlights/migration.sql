-- CreateTable
CREATE TABLE "SurveyHighlight" (
    "id" TEXT NOT NULL,
    "answerId" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyHighlight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyAppraisal" (
    "id" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SurveyAppraisal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SurveyHighlight_answerId_key" ON "SurveyHighlight"("answerId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyAppraisal_view_scope_mes_key" ON "SurveyAppraisal"("view", "scope", "mes");

-- AddForeignKey
ALTER TABLE "SurveyHighlight" ADD CONSTRAINT "SurveyHighlight_answerId_fkey" FOREIGN KEY ("answerId") REFERENCES "Answer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
