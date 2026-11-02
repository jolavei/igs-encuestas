"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BLANK,
  CONDITION_LABELS,
  columnValues,
  conditionArity,
  conditionIsComplete,
  conditionsFor,
  matchesSearch,
  valueLabel,
  type ColumnFilter,
  type ConditionOp,
  type GridColumn,
  type GridRow,
} from "@/lib/responseBase/grid";

// Sobre este tope la lista se recorta (la búsqueda sigue alcanzando a todos los valores).
const MAX_VALUES_SHOWN = 300;
const MENU_WIDTH = 300;
const MENU_MAX_HEIGHT = 580;
const MENU_MIN_HEIGHT = 460; // con menos espacio bajo el botón, el menú se sube

const SORT_LABELS: Record<GridColumn["kind"], [string, string]> = {
  text: ["Ordenar A → Z", "Ordenar Z → A"],
  multi: ["Ordenar A → Z", "Ordenar Z → A"],
  file: ["Ordenar A → Z", "Ordenar Z → A"],
  number: ["Ordenar de menor a mayor", "Ordenar de mayor a menor"],
  date: ["Más antiguas primero", "Más recientes primero"],
};

const fmt = (n: number) => n.toLocaleString("es-CL");

/** Abre bajo el botón; si no cabe, se sube lo necesario para no salirse de la pantalla. */
function menuPosition(anchor: DOMRect) {
  const width = Math.min(MENU_WIDTH, window.innerWidth - 16);
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const below = anchor.bottom + 4;
  const top = Math.max(8, Math.min(below, window.innerHeight - MENU_MIN_HEIGHT - 8));
  return { left, top, width, maxHeight: Math.min(MENU_MAX_HEIGHT, window.innerHeight - top - 8) };
}

export default function ColumnFilterMenu({
  column,
  rows,
  filter,
  sortDir,
  anchor,
  onApply,
  onSort,
  onClose,
}: {
  column: GridColumn;
  rows: GridRow[]; // filas que pasan los filtros de las DEMÁS columnas
  filter: ColumnFilter | undefined;
  sortDir: "asc" | "desc" | null;
  anchor: DOMRect;
  onApply: (filter: ColumnFilter) => void;
  onSort: (dir: "asc" | "desc" | null) => void;
  onClose: () => void;
}) {
  const [excluded, setExcluded] = useState(() => new Set(filter?.excluded ?? []));
  const [search, setSearch] = useState("");
  const [op, setOp] = useState<ConditionOp | "">(filter?.condition?.op ?? "");
  const [a, setA] = useState(filter?.condition?.a ?? "");
  const [b, setB] = useState(filter?.condition?.b ?? "");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const values = useMemo(() => columnValues(rows, column), [rows, column]);
  const matching = useMemo(() => values.filter((v) => matchesSearch(v.value, search)), [values, search]);
  const shown = matching.slice(0, MAX_VALUES_SHOWN);

  const condition = op ? { op, a, b } : null;
  const conditionBad = !!condition && !conditionIsComplete(condition);
  const arity = op ? conditionArity(op) : 0;
  const inputType = column.kind === "date" ? "date" : "text";

  function toggle(value: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  // "Seleccionar todo" y "Borrar" actúan sobre lo que deja ver la búsqueda, como en Sheets.
  function selectMatching(selected: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const v of matching) {
        if (selected) next.delete(v.value);
        else next.add(v.value);
      }
      return next;
    });
  }

  function accept(e: React.FormEvent) {
    e.preventDefault();
    if (conditionBad) return;
    onApply({
      ...(excluded.size > 0 ? { excluded: [...excluded] } : {}),
      ...(condition ? { condition } : {}),
    });
  }

  const [ascLabel, descLabel] = SORT_LABELS[column.kind];
  const sortButton = (dir: "asc" | "desc", label: string) => (
    <button
      type="button"
      onClick={() => onSort(sortDir === dir ? null : dir)}
      aria-pressed={sortDir === dir}
      className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
        sortDir === dir ? "bg-brand-50 font-medium text-brand-700" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <form
        role="dialog"
        aria-modal="true"
        aria-label={`Filtrar columna: ${column.label}`}
        onSubmit={accept}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        style={menuPosition(anchor)}
        className="fixed z-50 flex flex-col overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
      >
        <div className="border-b border-slate-100 p-1.5">
          {sortButton("asc", ascLabel)}
          {sortButton("desc", descLabel)}
        </div>

        <details open={!!op} className="border-b border-slate-100 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-700">
            Filtrar por condición
          </summary>
          <div className="mt-2 space-y-2">
            <select
              value={op}
              onChange={(e) => setOp(e.target.value as ConditionOp | "")}
              aria-label="Condición"
              className="input"
            >
              <option value="">Ninguna</option>
              {conditionsFor(column.kind).map((o) => (
                <option key={o} value={o}>
                  {CONDITION_LABELS[o]}
                </option>
              ))}
            </select>
            {arity >= 1 && (
              <input
                type={inputType}
                inputMode={column.kind === "number" ? "decimal" : undefined}
                value={a}
                onChange={(e) => setA(e.target.value)}
                aria-label={arity === 2 ? "Desde" : "Valor"}
                placeholder={arity === 2 ? "Desde" : "Valor"}
                className="input"
              />
            )}
            {arity === 2 && (
              <input
                type={inputType}
                inputMode={column.kind === "number" ? "decimal" : undefined}
                value={b}
                onChange={(e) => setB(e.target.value)}
                aria-label="Hasta"
                placeholder="Hasta"
                className="input"
              />
            )}
          </div>
        </details>

        <div className="flex min-h-0 flex-1 flex-col px-3 pt-2">
          <p className="text-sm font-medium text-slate-700">Filtrar por valores</p>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => selectMatching(true)}
              className="font-medium text-brand-700 hover:underline"
            >
              Seleccionar todo
            </button>
            <span className="text-slate-300">·</span>
            <button
              type="button"
              onClick={() => selectMatching(false)}
              className="font-medium text-brand-700 hover:underline"
            >
              Borrar
            </button>
            <span className="ml-auto text-slate-400">
              {fmt(matching.length)} {matching.length === 1 ? "valor" : "valores"}
            </span>
          </div>
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar valor"
            aria-label="Buscar valor"
            className="input mt-2"
          />
          <ul className="mt-2 min-h-[7rem] flex-1 overflow-y-auto">
            {shown.map((v) => (
              <li key={v.value === BLANK ? "__blank" : v.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!excluded.has(v.value)}
                    onChange={() => toggle(v.value)}
                    className="h-4 w-4 shrink-0 accent-brand-600"
                  />
                  <span
                    className={`min-w-0 flex-1 truncate ${v.value === BLANK ? "italic text-slate-500" : "text-slate-700"}`}
                    title={valueLabel(v.value)}
                  >
                    {valueLabel(v.value)}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{fmt(v.count)}</span>
                </label>
              </li>
            ))}
            {matching.length === 0 && (
              <li className="px-1 py-2 text-sm text-slate-400">Sin valores que coincidan.</li>
            )}
            {matching.length > shown.length && (
              <li className="px-1 py-2 text-xs text-slate-400">
                Se muestran {fmt(shown.length)}. Usa la búsqueda para llegar al resto.
              </li>
            )}
          </ul>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 p-2">
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1.5">
            Cancelar
          </button>
          <button type="submit" disabled={conditionBad} className="btn px-3 py-1.5">
            Aceptar
          </button>
        </div>
      </form>
    </>
  );
}
