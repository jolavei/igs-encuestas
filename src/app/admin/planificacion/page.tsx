import { prisma } from "@/lib/prisma";
import PlanificacionPage from "@/components/planificacion/PlanificacionPage";

// La autorización (ADMIN) la aplica el layout de /admin. Datos siempre frescos.
export const dynamic = "force-dynamic";

export default async function Page() {
  const companies = await prisma.company.findMany({
    where: { active: true },
    include: { locations: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });

  const data = companies.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    locations: c.locations.map((l) => ({
      id: l.id,
      name: l.name,
      iataCode: l.iataCode,
      timezone: l.timezone,
    })),
  }));

  return <PlanificacionPage companies={data} />;
}
