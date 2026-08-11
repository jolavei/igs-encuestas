-- CreateTable
CREATE TABLE "AsqDepartureImport" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "objectPath" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOADED',
    "quarters" TEXT,
    "seasonLabel" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "ownRowCount" INTEGER NOT NULL DEFAULT 0,
    "replacedRows" INTEGER NOT NULL DEFAULT 0,
    "loadedRows" INTEGER NOT NULL DEFAULT 0,
    "airportsJson" TEXT,
    "bqTable" TEXT,
    "bqLoadJobId" TEXT,
    "ingestId" TEXT,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsqDepartureImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AsqDepartureImport_createdAt_idx" ON "AsqDepartureImport"("createdAt");

-- CreateIndex
CREATE INDEX "AsqDepartureImport_createdById_idx" ON "AsqDepartureImport"("createdById");

-- AddForeignKey
ALTER TABLE "AsqDepartureImport" ADD CONSTRAINT "AsqDepartureImport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
