-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL DEFAULT 'bigquery',
    "tables" INTEGER NOT NULL DEFAULT 0,
    "rows" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncLog_syncedAt_idx" ON "SyncLog"("syncedAt");
