"use client";
import { useRouter, usePathname } from "next/navigation";

// Selector de temporada para /admin/compliance. Cambia el query ?season=…
// (navega en el server component que lee de la BD).
export default function SeasonPicker({
  seasons,
  active,
}: {
  seasons: { seasonLabel: string; season: string; year: number }[];
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  if (seasons.length === 0) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-slate-500">Temporada</span>
      <select
        value={active}
        onChange={(e) =>
          router.push(`${pathname}?season=${encodeURIComponent(e.target.value)}`)
        }
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
      >
        {seasons.map((s) => (
          <option key={s.seasonLabel} value={s.seasonLabel}>
            {s.seasonLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
