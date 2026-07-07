-- CreateTable
CREATE TABLE "AsqComplianceRun" (
    "id" TEXT NOT NULL,
    "airport" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "terminal" TEXT NOT NULL DEFAULT 'ALL',
    "surveyType" TEXT NOT NULL DEFAULT 'DEPARTURES',
    "period" TEXT NOT NULL DEFAULT 'REGIONAL',
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsqComplianceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AsqComplianceRow" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "airlineDestination" TEXT NOT NULL,
    "airlineCode" TEXT,
    "destinationCode" TEXT,
    "target" INTEGER NOT NULL,
    "collected" INTEGER NOT NULL,

    CONSTRAINT "AsqComplianceRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AsqComplianceRun_seasonLabel_idx" ON "AsqComplianceRun"("seasonLabel");

-- CreateIndex
CREATE UNIQUE INDEX "AsqComplianceRun_airport_seasonLabel_key" ON "AsqComplianceRun"("airport", "seasonLabel");

-- CreateIndex
CREATE INDEX "AsqComplianceRow_runId_idx" ON "AsqComplianceRow"("runId");

-- AddForeignKey
ALTER TABLE "AsqComplianceRow" ADD CONSTRAINT "AsqComplianceRow_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AsqComplianceRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
