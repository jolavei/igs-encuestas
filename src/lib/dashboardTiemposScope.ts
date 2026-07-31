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
 * - SURVEYOR / CLIENT: los aeropuertos de su alcance donde el cuestionario está
 *   VIGENTE (Questionnaire.active = true). El alcance se arma con dos señales
 *   (unión), porque cada rol se acota distinto en la app:
 *     · sedes asignadas al usuario (assignedLocations) + su sede/empresa principal;
 *     · planes de trabajo ACTIVOS del cuestionario en los que el usuario participa
 *       (encuestador: asignado al plan; cliente: plan de su empresa/sede).
 *   Si el cuestionario se marca no vigente, o el plan deja de estar activo / se
 *   quita la sede, el aeropuerto deja de mostrarse.
 *
 * El cruce con los aeropuertos del dashboard es por NOMBRE de sede
 * (Location.name = location_name en BigQuery).
 */
export async function getScopedTiemposAirports(user: {
  id: string;
  role: Role;
}): Promise<DashboardAirport[]> {
  if (user.role === "ADMIN") return AIRPORTS.map(asPlain);

  // El cuestionario debe existir y estar vigente (tolerante a mayúsculas/acentos base).
  const q = await prisma.questionnaire.findFirst({
    where: { title: { equals: TIEMPOS_TITLE, mode: "insensitive" }, active: true },
    select: { id: true },
  });
  if (!q) return [];

  // Alcance del usuario: sedes asignadas + sede/empresa principal (compatibilidad).
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      companyId: true,
      locationId: true,
      location: { select: { name: true } },
      assignedLocations: { select: { id: true, name: true, companyId: true } },
    },
  });

  const names = new Set<string>();
  const locationIds = new Set<string>();
  const companyIds = new Set<string>();
  for (const l of dbUser?.assignedLocations ?? []) {
    names.add(l.name);
    locationIds.add(l.id);
    companyIds.add(l.companyId);
  }
  if (dbUser?.location?.name) names.add(dbUser.location.name);
  if (dbUser?.locationId) locationIds.add(dbUser.locationId);
  if (dbUser?.companyId) companyIds.add(dbUser.companyId);

  // Planes ACTIVOS del cuestionario donde el usuario participa.
  const plans = await prisma.workPlan.findMany({
    where: {
      status: "ACTIVE",
      questionnaireId: q.id,
      ...(user.role === "SURVEYOR"
        ? { surveyors: { some: { id: user.id } } }
        : { OR: [{ locationId: { in: [...locationIds] } }, { companyId: { in: [...companyIds] } }] }),
    },
    select: {
      location: { select: { name: true } },
      company: { select: { locations: { select: { name: true } } } },
    },
  });
  for (const p of plans) {
    if (p.location) names.add(p.location.name);
    else for (const l of p.company.locations) names.add(l.name); // plan a nivel empresa
  }

  // Cruce robusto sede -> aeropuerto: nombre exacto, o que el nombre contenga el
  // identificador del aeropuerto (p.ej. "Diego Aracena"), tolerando variantes
  // como "Aeropuerto Diego Aracena" o "Aeropuerto Diego Aracena - Iquique".
  const allowed = new Set<string>();
  for (const raw of names) {
    const n = raw.toLowerCase();
    for (const a of AIRPORTS) {
      if (n === a.name.toLowerCase() || n.includes(a.short.toLowerCase())) allowed.add(a.code);
    }
  }
  return AIRPORTS.filter((a) => allowed.has(a.code)).map(asPlain);
}
