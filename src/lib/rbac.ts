import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import type { Role } from "@/lib/enums";

export async function getSessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/** Para Server Components / pages: exige sesion y (opcional) rol. Redirige si falta. */
export async function requireUser(roles?: Role[]) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect("/denegado");
  return user;
}

/** Para API routes: devuelve user o null (el caller responde 401/403). */
export async function apiUser(roles?: Role[]) {
  const user = await getSessionUser();
  if (!user) return { user: null, status: 401 as const };
  if (roles && !roles.includes(user.role)) return { user: null, status: 403 as const };
  return { user, status: 200 as const };
}

export function homePathForRole(role: Role): string {
  switch (role) {
    case "ADMIN":
      return "/admin";
    case "SURVEYOR":
      return "/encuestador";
    case "CLIENT":
      return "/cliente";
  }
}
