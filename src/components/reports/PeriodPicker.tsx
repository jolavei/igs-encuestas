"use client";

import { useRouter } from "next/navigation";

type Option = { value: string; label: string };

const SELECT =
  "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

// Selector de periodo de la página de Informes: navega a
// /admin/informes?tipo=<slug>&periodo=<clave>[&foco=<temporada>] al cambiar.
export default function PeriodPicker({
  tipo,
  label,
  value,
  options,
  focus,
}: {
  tipo: string;
  label: string;
  value: string;
  options: Option[];
  focus?: { value: string; options: Option[] }; // solo anual: temporada de detalle
}) {
  const router = useRouter();
  const go = (periodo: string, foco?: string) => {
    const q = new URLSearchParams({ tipo, periodo });
    if (foco) q.set("foco", foco);
    router.push(`/admin/informes?${q.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <span>{label}</span>
        <select value={value} onChange={(e) => go(e.target.value)} className={SELECT}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {focus && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <span>Temporada de detalle</span>
          <select value={focus.value} onChange={(e) => go(value, e.target.value)} className={SELECT}>
            {focus.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
