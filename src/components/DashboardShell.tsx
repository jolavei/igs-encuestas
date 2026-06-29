import Link from "next/link";
import type { Role } from "@/lib/enums";
import SignOutButton from "./SignOutButton";

const NAV: Record<Role, { href: string; label: string }[]> = {
  ADMIN: [
    { href: "/admin", label: "Inicio" },
    { href: "/admin/cuestionarios", label: "Cuestionarios" },
    { href: "/admin/asignaciones", label: "Asignaciones" },
    { href: "/admin/empresas", label: "Empresas" },
    { href: "/admin/usuarios", label: "Usuarios" },
  ],
  SURVEYOR: [{ href: "/encuestador", label: "Mi plan de trabajo" }],
  CLIENT: [{ href: "/cliente", label: "Dashboard" }],
};

export default function DashboardShell({
  role,
  email,
  children,
}: {
  role: Role;
  email?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-bold text-brand-700">
              IGS Encuestas
            </Link>
            <nav className="flex gap-4 text-sm">
              {NAV[role].map((n) => (
                <Link key={n.href} href={n.href} className="text-slate-600 hover:text-slate-900">
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-500 sm:inline">
              {email} · {role}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
