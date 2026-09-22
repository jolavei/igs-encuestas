"use client";

import { useEffect, useMemo, useState } from "react";
import AirportFlightsModule from "./AirportFlightsModule";

// Estilo de <select> alineado a los controles de la app.
const SELECT_CLS =
  "w-full rounded-md border border-slate-400 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// Recuerda el aeropuerto elegido entre navegaciones / reinicios del navegador.
const STORAGE_KEY = "igs.planificacion.airport";

export type LocationLite = { id: string; name: string; iataCode: string | null; timezone: string | null };
export type CompanyLite = { id: string; name: string; kind: string; locations: LocationLite[] };

export default function PlanificacionPage({ companies }: { companies: CompanyLite[] }) {
  const [selected, setSelected] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function runRefresh() {
    if (
      !window.confirm(
        "Esto ejecuta el job en GitHub que vuelve a consultar AeroDataBox y actualiza la base " +
          "(consume ~516 API units y tarda unos minutos). ¿Continuar?",
      )
    )
      return;
    setRefreshing(true);
    setRefreshMsg(null);
    try {
      const res = await fetch("/api/planificacion/refresh", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
      setRefreshMsg({
        ok: true,
        text: "Actualización iniciada en GitHub. Los datos se refrescan en unos minutos; recarga para ver la nueva fecha.",
      });
    } catch (e) {
      setRefreshMsg({ ok: false, text: e instanceof Error ? e.message : "No se pudo iniciar la actualización." });
    } finally {
      setRefreshing(false);
    }
  }

  // Solo empresas de tipo aeropuerto en el desplegable.
  const airportCompanies = useMemo(() => companies.filter((c) => c.kind === "aeropuerto"), [companies]);

  // Restaura la última selección guardada (si sigue existiendo).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && airportCompanies.some((c) => c.id === saved)) setSelected(saved);
    } catch {
      /* localStorage no disponible (modo privado, etc.) */
    }
  }, [airportCompanies]);

  function handleSelect(id: string) {
    setSelected(id);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignora si no hay localStorage */
    }
  }

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Planificación</h1>
          <p className="mt-1 text-sm text-slate-500">
            Herramientas para dimensionar y programar los turnos de levantamiento.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={runRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-brand-600 bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm transition-colors hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className={refreshing ? "animate-spin" : ""}>⟳</span>
            {refreshing ? "Iniciando…" : "Actualizar datos"}
          </button>
          {refreshMsg && (
            <p className={`max-w-xs text-right text-xs ${refreshMsg.ok ? "text-green-600" : "text-red-600"}`}>
              {refreshMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Aeropuerto (empresa / cliente) — define el aeropuerto de forma automática */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <label className="mb-1.5 block text-sm font-semibold text-slate-700">Aeropuerto (empresa / cliente)</label>
        <select className={`${SELECT_CLS} sm:max-w-md`} value={selected} onChange={(e) => handleSelect(e.target.value)}>
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
