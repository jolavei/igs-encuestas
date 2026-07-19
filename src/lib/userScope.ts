import { prisma } from "@/lib/prisma";

// Sedes asignadas a un usuario (multi-selección de la página Usuarios) + los ids
// de empresa derivados. Es la base del alcance de Encuestador y Cliente: cada uno
// ve solo la información de sus empresas/sedes.
export async function getUserScope(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      assignedLocations: {
        select: {
          id: true,
          name: true,
          companyId: true,
          company: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      },
    },
  });
  const locations = user?.assignedLocations ?? [];
  const locationIds = locations.map((l) => l.id);
  const companyIds = Array.from(new Set(locations.map((l) => l.companyId)));
  return { locations, locationIds, companyIds };
}
