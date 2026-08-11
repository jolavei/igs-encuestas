import { prisma } from "@/lib/prisma";

// Códigos de aeropuerto "propios" = los mapeados a una empresa en AsqAirportMapping.
// Se usan para marcar `_is_own_airport` en la ingesta (el resto del panel = pares
// de benchmarking). Devuelve un Set en mayúsculas (los códigos IATA/ASQ lo son).
export async function getOwnAirportCodes(): Promise<Set<string>> {
  const rows = await prisma.asqAirportMapping.findMany({
    where: { companyId: { not: null } },
    select: { airport: true },
  });
  return new Set(rows.map((r) => r.airport.toUpperCase()));
}
