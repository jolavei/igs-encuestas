-- AlterTable
ALTER TABLE "Questionnaire" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "address" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "emergencyName" TEXT,
ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "rut" TEXT;

-- CreateTable
CREATE TABLE "AsqAirportMapping" (
    "airport" TEXT NOT NULL,
    "companyId" TEXT,
    "locationId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsqAirportMapping_pkey" PRIMARY KEY ("airport")
);

-- CreateTable
CREATE TABLE "_UserAssignedLocations" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "AsqAirportMapping_companyId_idx" ON "AsqAirportMapping"("companyId");

-- CreateIndex
CREATE INDEX "AsqAirportMapping_locationId_idx" ON "AsqAirportMapping"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "_UserAssignedLocations_AB_unique" ON "_UserAssignedLocations"("A", "B");

-- CreateIndex
CREATE INDEX "_UserAssignedLocations_B_index" ON "_UserAssignedLocations"("B");

-- AddForeignKey
ALTER TABLE "AsqAirportMapping" ADD CONSTRAINT "AsqAirportMapping_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AsqAirportMapping" ADD CONSTRAINT "AsqAirportMapping_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserAssignedLocations" ADD CONSTRAINT "_UserAssignedLocations_A_fkey" FOREIGN KEY ("A") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_UserAssignedLocations" ADD CONSTRAINT "_UserAssignedLocations_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
