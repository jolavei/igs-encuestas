"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/enums";
import { Logo } from "@/components/Logo";
import {
  NAV_ICONS,
  type IconName,
  MenuIcon,
  LogoutIcon,
  ChevronDownIcon,
  UserIcon,
} from "@/components/icons";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

const NAV: Record<Role, NavItem[]> = {
  ADMIN: [
    { href: "/admin", label: "Inicio", icon: "home", exact: true },
    { href: "/admin/cuestionarios", label: "Cuestionarios", icon: "questionnaire" },
    { href: "/admin/planes", label: "Planes de trabajo", icon: "assignment" },
    { href: "/admin/levantar", label: "Levantar encuesta", icon: "workplan" },
    { href: "/admin/compliance", label: "Encuestas ASQ", icon: "compliance" },
    { href: "/admin/documentos", label: "Documentos", icon: "documents" },
    { href: "/admin/empresas", label: "Empresas", icon: "company" },
    { href: "/admin/usuarios", label: "Usuarios", icon: "users" },
  ],
  SURVEYOR: [
    { href: "/encuestador", label: "Inicio", icon: "home", exact: true },
    { href: "/encuestador/levantar", label: "Levantar encuesta", icon: "workplan" },
    { href: "/encuestador/compliance", label: "Encuestas ASQ", icon: "compliance" },
  ],
  CLIENT: [
    { href: "/cliente", label: "Inicio", icon: "home", exact: true },
    { href: "/cliente/compliance", label: "Encuestas ASQ", icon: "compliance" },
    { href: "/cliente/documentos", label: "Documentos", icon: "documents" },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  SURVEYOR: "Encuestador",
  CLIENT: "Cliente",
};

function initials(name?: string | null, email?: string | null) {
  const base = (name || email || "?").trim();
  const parts = base.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function isActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function AppShell({
  role,
  email,
  name,
  children,
}: {
  role: Role;
  email?: string | null;
  name?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem("igs.sidebar.collapsed") === "1");
  }, []);
  useEffect(() => {
    setMobileOpen(false); // cierra el drawer al navegar
    setMenuOpen(false); // cierra el menú de perfil al navegar
  }, [pathname]);

  // Cierra el menú de perfil al hacer clic fuera o con Escape.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  // Un solo botón hamburguesa: en escritorio colapsa/expande el sidebar;
  // en móvil abre/cierra el drawer.
  function toggleSidebar() {
    const isDesktop =
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches;
    if (isDesktop) {
      setCollapsed((v) => {
        localStorage.setItem("igs.sidebar.collapsed", v ? "0" : "1");
        return !v;
      });
    } else {
      setMobileOpen((v) => !v);
    }
  }

  const items = NAV[role];

  // Lista de navegación reutilizada en escritorio y en el drawer móvil.
  function NavList({ showLabels }: { showLabels: boolean }) {
    return (
      <nav className="flex-1 space-y-1 px-3 py-4">
        {items.map((item) => {
          const Icon = NAV_ICONS[item.icon];
          const active = isActive(pathname, item);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={showLabels ? undefined : item.label}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                showLabels ? "" : "justify-center"
              } ${
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon
                className={
                  active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"
                }
              />
              {showLabels && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* === Barra superior (todas las pantallas) === */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={toggleSidebar}
            className="rounded-md p-2 text-slate-600 transition-colors hover:bg-slate-100"
            aria-label="Abrir o cerrar menú lateral"
          >
            <MenuIcon width={22} height={22} />
          </button>
          <Link href="/" className="flex items-center" aria-label="Inicio">
            <Logo variant="full" className="h-7 w-auto sm:h-8" />
          </Link>
        </div>

        {/* Menú de perfil a la derecha */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Menú de perfil"
            className="flex items-center gap-2 rounded-md p-1 pr-1.5 transition-colors hover:bg-slate-100 sm:pr-2"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
              {initials(name, email)}
            </div>
            <div className="hidden min-w-0 text-left leading-tight sm:block">
              <p className="truncate text-sm font-medium text-slate-800">{name || email}</p>
              <p className="text-xs text-slate-400">{ROLE_LABEL[role]}</p>
            </div>
            <ChevronDownIcon
              className={`hidden shrink-0 text-slate-400 transition-transform sm:block ${
                menuOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg"
            >
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="truncate text-sm font-semibold text-slate-800">{name || "—"}</p>
                <p className="truncate text-xs text-slate-500">{email}</p>
                <span className="mt-1.5 inline-block rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                  {ROLE_LABEL[role]}
                </span>
              </div>
              <Link
                href="/perfil"
                role="menuitem"
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                <UserIcon className="text-slate-400" /> Mi perfil
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                role="menuitem"
                className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
              >
                <LogoutIcon className="text-slate-400" /> Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        {/* === Sidebar de escritorio (colapsable) === */}
        <aside
          className={`sticky top-14 hidden h-[calc(100vh-3.5rem)] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-[width] duration-200 ease-out lg:flex ${
            collapsed ? "w-[4.5rem]" : "w-60"
          }`}
        >
          <NavList showLabels={!collapsed} />
        </aside>

        {/* === Overlay + drawer móvil === */}
        {mobileOpen && (
          <div
            className="fixed inset-x-0 bottom-0 top-14 z-30 bg-slate-900/30 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          className={`fixed bottom-0 left-0 top-14 z-40 flex w-64 flex-col overflow-y-auto border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:hidden ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <NavList showLabels />
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
