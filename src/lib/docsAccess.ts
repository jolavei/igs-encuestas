import type { Role } from "@/lib/enums";

// El cliente ve documentos/carpetas de sus sedes asignadas (multi-selección).
// El admin ve todo. El encuestador no accede a documentos.
export function canAccessDocScoped(
  role: Role,
  assignedLocationIds: string[],
  item: { locationId: string | null }
): boolean {
  if (role === "ADMIN") return true;
  if (role === "CLIENT") {
    return item.locationId != null && assignedLocationIds.includes(item.locationId);
  }
  return false;
}
