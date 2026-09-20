"use client";

import { useMemo, useState } from "react";
import AirportFlightsModule from "./AirportFlightsModule";

// Estilo de <select> alineado a los controles de la app.
const SELECT_CLS =
  "w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export type LocationLite = { id: string; name: string; iataCode: string | null; timezone: string | null };
export type CompanyLite = { id: string; name: string; kind: string; locations: LocationLite[] };

export default function PlanificacionPage({ companies }: { companies: CompanyLite[] }) {
  const [selected, setSelected] = useState<string>("");

  // Solo empresas de tipo aeropuerto en el desplegable.
  const airportCompanies = useMemo(() => companies.filter((c) => c.kind === "aeropuerto"), [companies]);

  const company = useMemo(
    () => airportCompanies.find((c) => c.id === selected) ?? null,
    [airportCompanies, selected],
  );

  // La empresa/cliente define el aeropuerto: tomamos la 1ª sede con código IATA.
  const airport = useMemo(() => {
    const loc = company?.locations.find((l) => l.iataCode);
    return loc ? { iata: loc.iataCode!.toUpperCase(), name: loc.name } : null;
  }, [company]);

  return (
    <div className="space-y-6 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Planificación</h1>
        <p className="mt-1 text-sm text-slate-500">
          Herramientas para dimensionar y programar los turnos de levantamiento.
        </p>
      </div>

      {/* Aeropuerto (empresa / cliente) — define el aeropuerto de forma automática */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Aeropuerto (empresa / cliente)</label>
        <select className={`${SELECT_CLS} sm:max-w-md`} value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">— Selecciona —</option>
          {airportCompanies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {selected === "" && <EmptyState />}

      {company &&
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
