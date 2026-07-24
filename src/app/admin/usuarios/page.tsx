import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import UserEditor, { type EditorUser } from "@/components/UserEditor";
import { utcToChileDay } from "@/lib/dates";
import UserActiveToggle from "@/components/UserActiveToggle";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  SURVEYOR: "Encuestador",
  CLIENT: "Cliente",
};

export default async function UsuariosPage() {
  const [me, users, companies] = await Promise.all([
    getSessionUser(),
    prisma.user.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
      include: {
        assignedLocations: {
          select: { id: true, name: true, company: { select: { name: true } } },
          orderBy: { name: "asc" },
        },
      },
    }),
    prisma.company.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        locations: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const vigentes = users.filter((u) => u.active);
  const noVigentes = users.filter((u) => !u.active);

  function userCard(u: (typeof users)[number]) {
    const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.name || "—";
    const editorUser: EditorUser = {
      id: u.id,
      email: u.email,
      role: u.role,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      address: u.address,
      rut: u.rut,
      birthDate: u.birthDate ? utcToChileDay(u.birthDate) : null,
      emergencyName: u.emergencyName,
      emergencyPhone: u.emergencyPhone,
      locationIds: u.assignedLocations.map((l) => l.id),
    };
    return (
      <div key={u.id} className={`card ${!u.active ? "bg-slate-50 opacity-75" : ""}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{fullName}</h3>
              <span className="rounded bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                {ROLE_LABEL[u.role] ?? u.role}
              </span>
              {!u.active && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  Desactivado
                </span>
              )}
            </div>
            <p className="break-all text-sm text-slate-500">{u.email}</p>
            <p className="text-xs text-slate-500">
              {u.assignedLocations.length > 0
                ? u.assignedLocations
                    .map((l) => `${l.company.name} · ${l.name}`)
                    .join("  |  ")
                : "Sin sedes asignadas"}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-start gap-2">
            <UserEditor companies={companies} user={editorUser} triggerLabel="Editar" />
            <UserActiveToggle id={u.id} active={u.active} isSelf={u.id === me?.id} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Usuarios y roles</h1>
          <p className="mt-1 max-w-2xl text-slate-500">
            Agrega usuarios por correo (mantienen rol, datos y sedes al iniciar sesión). Los
            desactivados no pueden ingresar pero conservan su historial.
          </p>
        </div>
        <UserEditor
          companies={companies}
          triggerLabel="+ Agregar usuario"
          triggerClass="btn shrink-0"
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Vigentes</h2>
        {vigentes.length === 0 ? (
          <p className="text-sm text-slate-400">Sin usuarios vigentes.</p>
        ) : (
          <div className="space-y-3">{vigentes.map(userCard)}</div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          No vigentes
        </h2>
        {noVigentes.length === 0 ? (
          <p className="text-sm text-slate-400">Sin usuarios no vigentes.</p>
        ) : (
          <div className="space-y-3">{noVigentes.map(userCard)}</div>
        )}
      </section>
    </div>
  );
}
