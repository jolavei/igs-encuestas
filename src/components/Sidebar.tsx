"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import type { Role } from "@/lib/enums";
import { Logo } from "@/components/Logo";
import {
  NAV_ICONS,
  type IconName,
  ChevronLeftIcon,
  MenuIcon,
  CloseIcon,
  LogoutIcon,
} from "@/components/icons";

type NavItem = { href: string; label: string; icon: IconName; exact?: boolean };

const NAV: Record<Role, NavItem[]> = {
  ADMIN: [
    { href: "/admin", label: "Inicio", icon: "home", exact: true },
    { href: "/admin/cuestionarios", label: "Cuestionarios", icon: "questionnaire" },
    { href: "/admin/asignaciones", label: "Asignaciones", icon: "assignment" },
    { href: "/admin/empresas", label: "Empresas", icon: "company" },
    { href: "/admin/usuarios", label: "Usuarios", icon: "users" },
  ],
  SURVEYOR: [{ href: "/encuestador", label: "Mi plan de trabajo", icon: "workplan" }],
  CLIENT: [{ href: "/cliente", label: "Dashboard", icon: "dashboard" }],
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
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function Sidebar({
  role,
  email,
  name,
}: {
  role: Role;
  email?: string | null;
  name?: string | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem("igs.sidebar.collapsed") === "1");
  }, []);
  useEffect(() => {
    setMobileOpen(false); // cierra el drawer al navegar
  }, [pathname]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem("igs.sidebar.collapsed", v ? "0" : "1");
      return !v;
    });
  }

  const items = NAV[role];

  // Contenido de navegación reutilizado en desktop y en el drawer móvil.
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
              <Icon className={active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600"} />
              {showLabels && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    );
  }

  function UserBlock({ showLabels }: { showLabels: boolean }) {
    return (
      <div className="border-t border-slate-200 p-3">
        <div className={`flex items-center gap-3 ${showLabels ? "" : "justify-center"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
            {initials(name, email)}
          </div>
          {showLabels && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{name || email}</p>
              <p className="text-xs text-slate-400">{ROLE_LABEL[role]}</p>
            </div>
          )}
          {showLabels && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Salir"
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <LogoutIcon />
            </button>
          )}
        </div>
        {!showLabels && (
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            title="Salir"
            className="mt-2 flex w-full items-center justify-center rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <LogoutIcon />
          </button>
        )}
      </div>
    );
  }

  function Brand({ showText }: { showText: boolean }) {
    return (
      <Link href="/" className="flex items-center justify-center px-3 py-4">
        {showText ? (
          <Logo variant="full" className="h-9 w-auto" />
        ) : (
          <Logo variant="icon" className="h-8 w-8 object-contain" />
        )}
      </Link>
    );
  }

  return (
    <>
      {/* === Sidebar de escritorio (colapsable) === */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out lg:flex ${
          collapsed ? "w-[4.5rem]" : "w-64"
        }`}
      >
        <Brand showText={!collapsed} />
        <NavList showLabels={!collapsed} />
        <button
          onClick={toggleCollapsed}
          className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          <ChevronLeftIcon className={`transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`} />
          {!collapsed && <span>Colapsar</span>}
        </button>
        <UserBlock showLabels={!collapsed} />
      </aside>

      {/* === Barra superior móvil === */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
          aria-label="Abrir menú"
        >
          <MenuIcon width={22} height={22} />
        </button>
        <Logo variant="full" className="h-7 w-auto" />
      </header>

      {/* === Drawer móvil === */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200 ease-out lg:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between pr-3">
          <Brand showText />
          <button
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Cerrar menú"
          >
            <CloseIcon />
          </button>
        </div>
        <NavList showLabels />
        <UserBlock showLabels />
      </aside>
    </>
  );
}
