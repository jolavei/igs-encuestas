import type { Role } from "@/lib/enums";

type SessionUserLike = {
  role: Role;
  companyId: string | null;
  locationId: string | null;
};

type Scoped = { companyId: string; locationId: string | null };

// El cliente ve documentos/carpetas de su empresa: su sede específica + los de
// alcance general (sin sede). El admin ve todo. El encuestador no accede.
export function canAccessDoc(user: SessionUserLike, item: Scoped): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "CLIENT") {
    return (
      !!user.companyId &&
      item.companyId === user.companyId &&
      (item.locationId === null || item.locationId === user.locationId)
    );
  }
  return false;
}

// Filtro Prisma para lo que un cliente puede ver dentro de su empresa+sede.
export function clientDocScope(user: SessionUserLike) {
  return {
    companyId: user.companyId ?? "__none__",
    OR: [{ locationId: null }, { locationId: user.locationId }],
  };
}
