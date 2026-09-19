"use client";

import { useState } from "react";

// Calendario de selección de rango (ventana de tiempo). Todo en fecha local,
// comparando strings YYYY-MM-DD (orden lexicográfico = orden cronológico).

const WEEKDAYS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];

function isoOf(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function todayISO() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function RangeCalendar({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  // Mes mostrado (arranca en el mes de `from`).
  const [cursor, setCursor] = useState(() => {
    const [y, m] = from.split("-").map(Number);
    return { y, m: m - 1 };
  });
  // Estado de la selección en curso: si ya hay rango completo, el próximo clic reinicia.
  const [picking, setPicking] = useState(false);

  const today = todayISO();
  const monthLabel = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric" }).format(
    new Date(cursor.y, cursor.m, 1),
  );

  const firstWeekday = (new Date(cursor.y, cursor.m, 1).getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(isoOf(cursor.y, cursor.m, d));

  function move(delta: number) {
    setCursor((c) => {
      const dt = new Date(c.y, c.m + delta, 1);
      return { y: dt.getFullYear(), m: dt.getMonth() };
    });
  }

  function pick(iso: string) {
    if (!picking) {
      // Inicia un rango nuevo.
      onChange(iso, iso);
      setPicking(true);
    } else {
      // Cierra el rango; ordena si eligieron una fecha anterior.
      if (iso >= from) onChange(from, iso);
      else onChange(iso, from);
      setPicking(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-300 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => move(-1)}
          aria-label="Mes anterior"
          className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100"
        >
          ‹
        </button>
        <span className="text-sm font-semibold capitalize text-slate-700">{monthLabel}</span>
        <button
          type="button"
          onClick={() => move(1)}
          aria-label="Mes siguiente"
          className="rounded p-1 text-slate-500 transition-colors hover:bg-slate-100"
        >
          ›
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-medium uppercase text-slate-400">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <div key={`e${i}`} />;
          const isStart = iso === from;
          const isEnd = iso === to;
          const inRange = iso > from && iso < to;
          const isToday = iso === today;
          const day = Number(iso.slice(8, 10));
          return (
            <button
              type="button"
              key={iso}
              onClick={() => pick(iso)}
              className={[
                "flex h-8 items-center justify-center rounded text-xs font-medium transition-colors",
                isStart || isEnd
                  ? "bg-brand-600 text-white"
                  : inRange
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100",
                isToday && !(isStart || isEnd) ? "ring-1 ring-brand-300" : "",
              ].join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={() => {
            onChange(today, today);
            setCursor(() => {
              const d = new Date();
              return { y: d.getFullYear(), m: d.getMonth() };
            });
            setPicking(true);
          }}
          className="text-[11px] font-medium text-brand-600 hover:underline"
        >
          Ir a hoy
        </button>
      </div>
    </div>
  );
}
