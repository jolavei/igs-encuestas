"use client";

import { useRouter } from "next/navigation";

// Selector de mes: navega a /admin/informes?mes=YYYY-MM al cambiar.
export default function MonthPicker({
  value,
  options,
}: {
  value: string;
  options: { value: string; label: string }[];
}) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span>Mes</span>
      <select
        value={value}
        onChange={(e) => router.push(`/admin/informes?mes=${e.target.value}`)}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
