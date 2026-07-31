import { prisma } from "@/lib/prisma";
import { getUserScope } from "@/lib/userScope";
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
 * - SURVEYOR / CLIENT: los de su alcance (sedes asignadas) donde el cuestionario
 *   está HABILITADO (la empresa de la sede está asociada al cuestionario) y
 *   VIGENTE (Questionnaire.active = true). Si el cuestionario se marca no vigente
 *   o se desasocia la empresa, el aeropuerto deja de mostrarse.
 */
export async function getScopedTiemposAirports(user: {
  id: string;
  role: Role;
}): Promise<DashboardAirport[]> {
  if (user.role === "ADMIN") return AIRPORTS.map(asPlain);

  // Cuestionario vigente + empresas donde está habilitado.
  const q = await prisma.questionnaire.findFirst({
    where: { title: TIEMPOS_TITLE, active: true },
    select: { companies: { select: { id: true } } },
  });
  if (!q || q.companies.length === 0) return [];
  const enabledCompanyIds = new Set(q.companies.map((c) => c.id));

  // Alcance del usuario: sus sedes asignadas (cada una con su empresa).
  const { locations } = await getUserScope(user.id);
  const allowedNames = new Set(
    locations.filter((l) => enabledCompanyIds.has(l.companyId)).map((l) => l.name)
  );

  return AIRPORTS.filter((a) => allowedNames.has(a.name)).map(asPlain);
}
