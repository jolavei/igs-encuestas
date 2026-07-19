import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  SURVEYOR: "Encuestador",
  CLIENT: "Cliente",
};

function fmtDate(d: Date | null) {
  if (!d) return null;
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    dateStyle: "long",
  }).format(d);
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm text-slate-800">{value || "—"}</dd>
    </div>
  );
}

export default async function PerfilPage() {
  const me = await getSessionUser();
  const user = me?.id
    ? await prisma.user.findUnique({
        where: { id: me.id },
        include: {
          assignedLocations: {
            select: { id: true, name: true, company: { select: { name: true } } },
            orderBy: { name: "asc" },
          },
        },
      })
    : null;

  if (!user) {
    return <p className="text-slate-500">No se pudo cargar tu perfil.</p>;
  }

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Mi perfil</h1>
        <p className="text-sm text-slate-500">
          Información de tu cuenta (solo lectura). Para modificarla, contacta a un administrador.
        </p>
      </div>

      <section className="card space-y-4">
        <h2 className="font-semibold">Datos personales</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" value={fullName} />
          <Field label="Correo" value={user.email} />
          <Field label="Rol" value={ROLE_LABEL[user.role] ?? user.role} />
          <Field label="RUT" value={user.rut} />
          <Field label="Teléfono" value={user.phone} />
          <Field label="Fecha de nacimiento" value={fmtDate(user.birthDate)} />
          <Field label="Dirección" value={user.address} />
        </dl>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Contacto de emergencia</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" value={user.emergencyName} />
          <Field label="Teléfono" value={user.emergencyPhone} />
        </dl>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Empresas y sedes asignadas</h2>
        {user.assignedLocations.length === 0 ? (
          <p className="text-sm text-slate-400">Sin sedes asignadas.</p>
        ) : (
          <ul className="space-y-1 text-sm text-slate-700">
            {user.assignedLocations.map((l) => (
              <li key={l.id}>
                • {l.company.name} · {l.name}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
