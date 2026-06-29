// Enums como uniones de string (portables: SQLite no soporta enums Prisma).
// La validacion de valores permitidos se hace en la capa de app (zod).

export type Role = "ADMIN" | "SURVEYOR" | "CLIENT";
export type VersionStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";
export type ResponseSource = "FIELD" | "QR_PUBLIC";
export type AssignmentStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

export const ROLES: Role[] = ["ADMIN", "SURVEYOR", "CLIENT"];

// Columnas JSON se guardan como TEXT (stringify) para portabilidad con SQLite.
export function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(value);
}

export function fromJson<T>(value: string | null | undefined): T | null {
  if (value === undefined || value === null || value === "") return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
