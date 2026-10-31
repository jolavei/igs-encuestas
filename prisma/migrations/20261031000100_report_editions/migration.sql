-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "airport" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "modules" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportEdition" (
    "id" TEXT NOT NULL,
    "airport" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "focusSeason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BORRADOR',
    "modules" JSONB,
    "notes" JSONB,
    "comentarios" TEXT,
    "updatedById" TEXT,
    "emittedAt" TIMESTAMP(3),
    "emittedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportEdition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_airport_kind_key" ON "ReportTemplate"("airport", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "ReportEdition_airport_kind_periodKey_key" ON "ReportEdition"("airport", "kind", "periodKey");
