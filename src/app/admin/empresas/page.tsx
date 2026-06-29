import { prisma } from "@/lib/prisma";
import PostForm from "@/components/PostForm";
import CompanyActions from "@/components/CompanyActions";

export default async function EmpresasPage() {
  const companies = await prisma.company.findMany({
    include: {
      locations: true,
      _count: { select: { questionnaires: true } },
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });

  // Respuestas por empresa (vía sus sedes) para saber si tiene histórico.
  const responseCounts = await prisma.responseSet.groupBy({
    by: ["locationId"],
    _count: { _all: true },
  });
  const respByLocation = new Map(
    responseCounts.map((r) => [r.locationId, r._count._all])
  );
  const responsesByCompany = new Map<string, number>();
  for (const c of companies) {
    const total = c.locations.reduce(
      (sum, l) => sum + (respByLocation.get(l.id) ?? 0),
      0
    );
    responsesByCompany.set(c.id, total);
  }

  const activeCompanies = companies.filter((c) => c.active);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Empresas / Clientes</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Nueva empresa</h2>
          <PostForm
            endpoint="/api/companies"
            submitLabel="Crear empresa"
            fields={[
              { name: "name", label: "Nombre", required: true },
              {
                name: "kind",
                label: "Tipo",
                type: "select",
                required: true,
                options: [
                  { value: "hotel", label: "Hotel" },
                  { value: "aeropuerto", label: "Aeropuerto" },
                  { value: "clinica", label: "Clínica" },
                  { value: "otro", label: "Otro" },
                ],
              },
            ]}
          />
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Nueva sede / ubicación</h2>
          <PostForm
            endpoint="/api/locations"
            submitLabel="Crear sede"
            fields={[
              {
                name: "companyId",
                label: "Empresa",
                type: "select",
                required: true,
                options: activeCompanies.map((c) => ({ value: c.id, label: c.name })),
              },
              { name: "name", label: "Nombre sede", required: true },
              { name: "city", label: "Ciudad" },
              { name: "address", label: "Dirección" },
            ]}
          />
        </div>
      </div>

      <div className="space-y-3">
        {companies.map((c) => {
          const responses = responsesByCompany.get(c.id) ?? 0;
          const canDelete = c._count.questionnaires === 0 && responses === 0;
          return (
            <div
              key={c.id}
              className={`card ${!c.active ? "border-slate-200 bg-slate-50 opacity-75" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{c.name}</h3>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase text-slate-500">
                      {c.kind}
                    </span>
                    {!c.active && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Desactivada
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {c._count.questionnaires} cuestionario(s) · {responses} respuesta(s)
                  </p>
                  <ul className="mt-2 text-sm text-slate-600">
                    {c.locations.length === 0 && (
                      <li className="text-slate-400">Sin sedes.</li>
                    )}
                    {c.locations.map((l) => (
                      <li key={l.id}>
                        • {l.name} {l.city && `· ${l.city}`}
                      </li>
                    ))}
                  </ul>
                </div>
                <CompanyActions
                  id={c.id}
                  name={c.name}
                  active={c.active}
                  canDelete={canDelete}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
