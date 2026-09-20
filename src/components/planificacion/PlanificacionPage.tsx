"use client";

import { useMemo, useState } from "react";
import AirportFlightsModule from "./AirportFlightsModule";

// Estilo de <select> alineado a los controles de la app.
const SELECT_CLS =
  "w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export type LocationLite = { id: string; name: string; iataCode: string | null; timezone: string | null };
export type CompanyLite = { id: string; name: string; kind: string; locations: LocationLite[] };

// Etiqueta legible para cada tipo de empresa.
const KIND_LABEL: Record<string, string> = {
  aeropuerto: "Aeropuerto",
  hotel: "Hotel",
  clinica: "Clínica",
  hospital: "Hospital",
};
function kindLabel(kind: string) {
  return KIND_LABEL[kind] ?? kind.charAt(0).toUpperCase() + kind.slice(1);
}

// Módulos previstos por tipo de empresa (los no-aeropuerto son marcadores por ahora).
const PLANNED_MODULES: Record<string, string> = {
  hotel: "Ocupación proyectada por temporada, eventos de la ciudad y llegadas/salidas para dimensionar turnos.",
  clinica: "Agenda de horas y afluencia por especialidad y franja horaria.",
  hospital: "Afluencia de urgencias y consultas por franja horaria y día de la semana.",
};

export default function PlanificacionPage({ companies }: { companies: CompanyLite[] }) {
  const [selected, setSelected] = useState<string>("");

  const company = useMemo(() => companies.find((c) => c.id === selected) ?? null, [companies, selected]);

  // La empresa/cliente define el aeropuerto: tomamos la 1ª sede con código IATA.
  const airport = useMemo(() => {
    const loc = company?.locations.find((l) => l.iataCode);
    return loc ? { iata: loc.iataCode!.toUpperCase(), name: loc.name } : null;
  }, [company]);

  return (
    <div className="space-y-6 pb-16">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planificación</h1>
          <p className="mt-1 text-sm text-slate-500">
            Herramientas para dimensionar y programar los turnos de levantamiento. Los módulos cambian según el tipo de
            empresa.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
          Vista interna · en desarrollo
        </span>
      </div>

      {/* Aeropuerto (empresa / cliente) — define el aeropuerto de forma automática */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Aeropuerto (empresa / cliente)</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <select className={SELECT_CLS} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">— Selecciona —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {kindLabel(c.kind)}
              </option>
            ))}
          </select>
          {company && (
            <div className="flex items-center text-sm text-slate-500">
              Tipo:{" "}
              <span className="ml-1.5 rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700">
                {kindLabel(company.kind)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Despacho del módulo según el tipo de empresa */}
      {selected === "" && <EmptyState />}

      {company && company.kind === "aeropuerto" &&
        (airport ? (
          <AirportFlightsModule
            key={company.id} // remonta al cambiar de empresa → reinicia filtros/ventana
            iata={airport.iata}
            contextLabel={company.name}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-sm text-amber-700">
            Esta empresa no tiene una sede con código IATA. Agrégalo en{" "}
            <span className="font-medium">Empresas → sede</span> para poder consultar sus vuelos.
          </div>
        ))}

      {company && company.kind !== "aeropuerto" && (
        <ModulePlaceholder kind={company.kind} companyName={company.name} />
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
      <p className="text-sm text-slate-500">Selecciona un aeropuerto (empresa / cliente) para ver su planificación.</p>
    </div>
  );
}

function ModulePlaceholder({ kind, companyName }: { kind: string; companyName: string }) {
  const planned = PLANNED_MODULES[kind];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Módulo de {kindLabel(kind).toLowerCase()} — próximamente</h2>
      <p className="mt-1 text-sm text-slate-500">
        Aún no hay un módulo de planificación para <span className="font-medium">{companyName}</span>.
      </p>
      {planned && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <span className="font-medium text-slate-700">Idea para este tipo:</span> {planned}
        </div>
      )}
      <p className="mt-4 text-xs text-slate-400">
        Empezamos por la lógica de aeropuertos; los demás tipos se agregan sobre la misma estructura.
      </p>
    </div>
  );
}
