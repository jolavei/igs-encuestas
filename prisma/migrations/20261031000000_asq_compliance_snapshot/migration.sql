-- CreateTable
CREATE TABLE "AsqComplianceSnapshot" (
    "id" TEXT NOT NULL,
    "airport" TEXT NOT NULL,
    "season" TEXT NOT NULL,
    "seasonLabel" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "target" INTEGER NOT NULL,
    "collected" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsqComplianceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AsqComplianceSnapshot_airport_seasonLabel_snapshotDate_key" ON "AsqComplianceSnapshot"("airport", "seasonLabel", "snapshotDate");

-- CreateIndex
CREATE INDEX "AsqComplianceSnapshot_airport_season_year_snapshotDate_idx" ON "AsqComplianceSnapshot"("airport", "season", "year", "snapshotDate");

-- Carga inicial: la corrida vigente de cada aeropuerto + temporada pasa a ser la
-- primera foto, fechada el día (hora de Chile) en que se capturó.
INSERT INTO "AsqComplianceSnapshot" ("id", "airport", "season", "seasonLabel", "year", "snapshotDate", "target", "collected", "rows")
SELECT
    'snap_' || r."id",
    r."airport",
    r."season",
    r."seasonLabel",
    r."year",
    (r."scrapedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Santiago')::date,
    COALESCE(SUM(w."target"), 0)::int,
    COALESCE(SUM(w."collected"), 0)::int,
    COALESCE(
      jsonb_agg(
        jsonb_build_object('airlineDestination', w."airlineDestination", 'target', w."target", 'collected', w."collected")
        ORDER BY w."airlineDestination"
      ) FILTER (WHERE w."id" IS NOT NULL),
      '[]'::jsonb
    )
FROM "AsqComplianceRun" r
LEFT JOIN "AsqComplianceRow" w ON w."runId" = r."id"
GROUP BY r."id"
ON CONFLICT DO NOTHING;
