import { prisma } from "@/lib/prisma";
import { AIRPORTS } from "@/lib/dashboardTiempos";
import type { Role } from "@/lib/enums";

const TIEMPOS_TITLE = "Mediciones de tiempos";

export type DashboardAirport = { code: string; name: string; short: string };

const asPlain = (a: (typeof AIRPORTS)[number]): DashboardAirport => ({
  code: a.code,
  name: a.name,
  short: a.short,
});

/**
 * Aeropuertos del dashboard "Mediciones de tiempos" visibles para el usuario.
 * - ADMIN: todos.
 * - SURVEYOR / CLIENT: SOLO los aeropuertos de sus SEDES ASIGNADAS
 *   (assignedLocations + su sede principal por compatibilidad), y siempre que el
 *   cuestionario esté VIGENTE (Questionnaire.active = true; título
 *   case-insensitive). Si el cuestionario se marca no vigente, o se le quita la
 *   sede al usuario, el aeropuerto deja de mostrarse.
 *
 * El alcance es por ASIGNACIÓN de sede, no por planes de trabajo: un plan que
 * toque otro aeropuerto NO habilita ese aeropuerto para el usuario.
 *
 * Cruce sede -> aeropuerto tolerante a variantes de nombre (Location.name puede
 * ser "Aeropuerto Diego Aracena", "Diego Aracena", "... - Iquique", etc.); las
 * queries a BigQuery usan siempre el nombre canónico de AIRPORTS.
 */
export async function getScopedTiemposAirports(user: {
  id: string;
  role: Role;
}): Promise<DashboardAirport[]> {
  if (user.role === "ADMIN") return AIRPORTS.map(asPlain);

  // El cuestionario debe existir y estar vigente.
  const q = await prisma.questionnaire.findFirst({
    where: { title: { equals: TIEMPOS_TITLE, mode: "insensitive" }, active: true },
    select: { id: true },
  });
  if (!q) return [];

  // Sedes asignadas al usuario + su sede principal (compatibilidad).
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      location: { select: { name: true } },
      assignedLocations: { select: { name: true } },
    },
  });

  const names = new Set<string>();
  for (const l of dbUser?.assignedLocations ?? []) names.add(l.name);
  if (dbUser?.location?.name) names.add(dbUser.location.name);

  // Cruce robusto sede -> aeropuerto: nombre exacto, o que el nombre contenga el
  // identificador del aeropuerto ("Diego Aracena" / "El Loa" / "El Tepual").
  const allowed = new Set<string>();
  for (const raw of names) {
    const n = raw.toLowerCase();
    for (const a of AIRPORTS) {
      if (n === a.name.toLowerCase() || n.includes(a.short.toLowerCase())) allowed.add(a.code);
    }
  }
  return AIRPORTS.filter((a) => allowed.has(a.code)).map(asPlain);
}
