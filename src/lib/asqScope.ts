import { prisma } from "@/lib/prisma";

export type AsqAirportView = {
  airport: string;
  sedeLabel: string | null; // "Empresa · Sede" asociada
  seasonLabel: string;
  target: number;
  collected: number;
  rows: { id: string; airlineDestination: string; target: number; collected: number }[];
};

// Datos ASQ acotados a las empresas/sedes de un usuario: solo los aeropuertos
// mapeados a sus sedes (o empresas), en la temporada más reciente disponible.
// `mapped` = tiene aeropuertos asociados aunque aún no haya datos del scraper.
export async function getScopedAsq(locationIds: string[], companyIds: string[]) {
  if (locationIds.length === 0 && companyIds.length === 0) {
    return { airports: [] as AsqAirportView[], season: null, mapped: false };
  }

  const mappings = await prisma.asqAirportMapping.findMany({
    where: {
      OR: [{ locationId: { in: locationIds } }, { companyId: { in: companyIds } }],
    },
    include: { location: true, company: true },
  });
  if (mappings.length === 0) {
    return { airports: [] as AsqAirportView[], season: null, mapped: false };
  }

  const airportCodes = mappings.map((m) => m.airport);

  // Temporada más reciente (mismo orden cronológico que el panel admin).
  const seasons = await prisma.asqComplianceRun.findMany({
    where: { airport: { in: airportCodes } },
    distinct: ["seasonLabel"],
    select: { seasonLabel: true, season: true, year: true },
    orderBy: [{ year: "desc" }, { season: "desc" }],
  });
  if (seasons.length === 0) {
    return { airports: [] as AsqAirportView[], season: null, mapped: true };
  }
  const season = seasons[0].seasonLabel;

  const runs = await prisma.asqComplianceRun.findMany({
    where: { seasonLabel: season, airport: { in: airportCodes } },
    include: { rows: { orderBy: { airlineDestination: "asc" } } },
    orderBy: { airport: "asc" },
  });

  const mapByAirport = new Map(mappings.map((m) => [m.airport, m]));
  const airports: AsqAirportView[] = runs.map((r) => {
    const m = mapByAirport.get(r.airport);
    const sedeLabel = m?.company
      ? `${m.company.name}${m.location ? ` · ${m.location.name}` : ""}`
      : null;
    const target = r.rows.reduce((a, b) => a + b.target, 0);
    const collected = r.rows.reduce((a, b) => a + b.collected, 0);
    return {
      airport: r.airport,
      sedeLabel,
      seasonLabel: r.seasonLabel,
      target,
      collected,
      rows: r.rows.map((row) => ({
        id: row.id,
        airlineDestination: row.airlineDestination,
        target: row.target,
        collected: row.collected,
      })),
    };
  });

  return { airports, season, mapped: true };
}
