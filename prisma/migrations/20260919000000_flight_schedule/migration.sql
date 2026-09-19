-- CreateTable
CREATE TABLE "FlightSchedule" (
    "id" TEXT NOT NULL,
    "airportIata" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "airlineCode" TEXT,
    "airlineName" TEXT,
    "origin" TEXT NOT NULL,
    "originName" TEXT,
    "destination" TEXT NOT NULL,
    "destinationName" TEXT,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "aircraft" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlightSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlightSchedule_airportIata_date_idx" ON "FlightSchedule"("airportIata", "date");

-- CreateIndex
CREATE UNIQUE INDEX "FlightSchedule_airportIata_direction_flightNumber_date_time_key" ON "FlightSchedule"("airportIata", "direction", "flightNumber", "date", "time", "origin", "destination");
