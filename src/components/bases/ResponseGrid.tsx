"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FilterIcon } from "@/components/icons";
import ColumnFilterMenu from "@/components/bases/ColumnFilterMenu";
import {
  activeFilterCount,
  applyFilters,
  cellText,
  fileNameOf,
  isFilterActive,
  sortRows,
  type ColumnFilter,
  type GridColumn,
  type GridFilters,
  type GridRow,
  type GridSort,
} from "@/lib/responseBase/grid";

// Solo se dibujan las filas a la vista: un plan puede tener miles de envíos por decenas
// de preguntas, y el navegador no da abasto con todas esas celdas en la página.
const ROW_HEIGHT = 32;
const OVERSCAN = 8;
const NUMBER_COL_WIDTH = 56;

const fmt = (n: number) => n.toLocaleString("es-CL");

function columnWidth(c: GridColumn): number {
  if (c.wide) return 320;
  if (c.kind === "date") return 170;
  if (c.meta) return 160;
  if (c.kind === "number") return 150;
  return c.kind === "multi" ? 240 : 200;
}

export default function ResponseGrid({
  columns,
  rows,
  total,
  loading,
}: {
  columns: GridColumn[];
  rows: GridRow[];
  total: number;
  loading: boolean;
}) {
  const [filters, setFilters] = useState<GridFilters>({});
  const [sort, setSort] = useState<GridSort>(null);
  const [menu, setMenu] = useState<{ key: string; anchor: DOMRect; trigger: HTMLElement } | null>(null);
  const [selected, setSelected] = useState<{ rowId: string; colKey: string } | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const visibleRows = useMemo(() => {
    const filtered = applyFilters(rows, columns, filters);
    const sortCol = sort && columns.find((c) => c.key === sort.key);
    return sort && sortCol ? sortRows(filtered, sortCol, sort.dir) : filtered;
  }, [rows, columns, filters, sort]);

  // Al cambiar los filtros u orden se vuelve al inicio, igual que al cambiar de hoja.
  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0 });
  }, [filters, sort]);

  const menuColumn = menu && columns.find((c) => c.key === menu.key);
  const menuRows = useMemo(
    () => (menu ? applyFilters(rows, columns, filters, menu.key) : []),
    [menu, rows, columns, filters]
  );

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(visibleRows.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN);
  const windowRows = visibleRows.slice(start, end);
  const tableWidth = columns.reduce((sum, c) => sum + columnWidth(c), NUMBER_COL_WIDTH);

  const filterCount = activeFilterCount(filters);
  const selectedCol = selected && columns.find((c) => c.key === selected.colKey);
  const selectedRow = selected && rows.find((r) => r.id === selected.rowId);
  const selectedValue = selectedCol && selectedRow ? selectedRow.cells[selectedCol.key] : undefined;

  function closeMenu() {
    menu?.trigger.focus();
    setMenu(null);
  }

  function applyFilter(key: string, filter: ColumnFilter) {
    setFilters((prev) => {
      const next = { ...prev };
      if (isFilterActive(filter)) next[key] = filter;
      else delete next[key];
      return next;
    });
    closeMenu();
  }

  function selectCell(e: React.MouseEvent<HTMLTableSectionElement>) {
    const td = (e.target as HTMLElement).closest<HTMLElement>("td[data-col]");
    const rowId = td?.parentElement?.dataset.row;
    if (td?.dataset.col && rowId) setSelected({ rowId, colKey: td.dataset.col });
  }

  return (
    <div className="flex h-[calc(100dvh-16.5rem)] min-h-[26rem] flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
        <span className="font-medium text-slate-700">
          {visibleRows.length === rows.length
            ? `${fmt(rows.length)} ${rows.length === 1 ? "respuesta" : "respuestas"}`
            : `${fmt(visibleRows.length)} de ${fmt(rows.length)} respuestas`}
        </span>
        {loading && (
          <span className="text-slate-500">
            Cargando {fmt(rows.length)} de {fmt(total)}…
          </span>
        )}
        {filterCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({})}
            className="font-medium text-brand-700 hover:underline"
          >
            Quitar {filterCount === 1 ? "el filtro" : `los ${filterCount} filtros`}
          </button>
        )}
      </div>

      {/* Contenido completo de la celda elegida (las celdas recortan el texto largo). */}
      <div className="h-14 shrink-0 overflow-y-auto rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm">
        {selectedCol && selectedRow ? (
          <>
            <span className="font-medium text-slate-500">{selectedCol.label}: </span>
            {selectedCol.kind === "file" && Array.isArray(selectedValue) ? (
              selectedValue.map((path) => (
                <a
                  key={path}
                  href={`/api/responses/file?path=${encodeURIComponent(path)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mr-3 text-brand-700 hover:underline"
                >
                  {fileNameOf(path)}
                </a>
              ))
            ) : (
              <span className="whitespace-pre-wrap text-slate-800">
                {cellText(selectedCol, selectedValue) || <em className="text-slate-400">Sin respuesta</em>}
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-400">Selecciona una celda para ver su contenido completo.</span>
        )}
      </div>

      <div
        ref={scrollerRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-white"
      >
        <table
          className="table-fixed border-separate border-spacing-0 text-xs"
          style={{ width: tableWidth }}
        >
          <colgroup>
            <col style={{ width: NUMBER_COL_WIDTH }} />
            {columns.map((c) => (
              <col key={c.key} style={{ width: columnWidth(c) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-r border-slate-300 bg-slate-100 px-2 text-center font-medium text-slate-400">
                #
              </th>
              {columns.map((c) => {
                const active = isFilterActive(filters[c.key]);
                const sorted = sort?.key === c.key ? sort.dir : null;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    className={`sticky top-0 z-20 border-b border-r border-slate-300 px-2 py-1.5 text-left align-top font-normal ${
                      c.meta ? "bg-slate-100" : "bg-slate-50"
                    }`}
                  >
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1" title={c.label}>
                        {c.section && <p className="truncate text-[11px] text-slate-400">{c.section}</p>}
                        <p className="line-clamp-3 font-medium leading-snug text-slate-700">
                          {c.label}
                          {sorted && <span className="ml-1 text-brand-700">{sorted === "asc" ? "↑" : "↓"}</span>}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) =>
                          setMenu({
                            key: c.key,
                            anchor: e.currentTarget.getBoundingClientRect(),
                            trigger: e.currentTarget,
                          })
                        }
                        aria-haspopup="dialog"
                        aria-label={`Filtrar y ordenar: ${c.label}${active ? " (filtro activo)" : ""}`}
                        title="Filtrar y ordenar"
                        className={`shrink-0 rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                          active ? "bg-brand-600 text-white" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        }`}
                      >
                        <FilterIcon width={14} height={14} />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody onClick={selectCell}>
            {start > 0 && (
              <tr aria-hidden="true" style={{ height: start * ROW_HEIGHT }}>
                <td colSpan={columns.length + 1} />
              </tr>
            )}
            {windowRows.map((row, i) => (
              <tr key={row.id} data-row={row.id} style={{ height: ROW_HEIGHT }}>
                <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-2 text-center tabular-nums text-slate-400">
                  {fmt(start + i + 1)}
                </td>
                {columns.map((c) => {
                  const text = cellText(c, row.cells[c.key]);
                  const isSelected = selected?.rowId === row.id && selected.colKey === c.key;
                  return (
                    <td
                      key={c.key}
                      data-col={c.key}
                      title={text || undefined}
                      className={`cursor-cell truncate border-b border-r border-slate-200 px-2 text-slate-700 ${
                        c.kind === "number" ? "text-right tabular-nums" : ""
                      } ${isSelected ? "outline outline-2 -outline-offset-2 outline-brand-500" : ""}`}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
            {end < visibleRows.length && (
              <tr aria-hidden="true" style={{ height: (visibleRows.length - end) * ROW_HEIGHT }}>
                <td colSpan={columns.length + 1} />
              </tr>
            )}
          </tbody>
        </table>
        {visibleRows.length === 0 && !loading && (
          <div className="sticky left-0 p-8 text-center text-sm text-slate-500">
            Ninguna respuesta cumple los filtros.
          </div>
        )}
      </div>

      {menu && menuColumn && (
        <ColumnFilterMenu
          key={menu.key}
          column={menuColumn}
          rows={menuRows}
          filter={filters[menu.key]}
          sortDir={sort?.key === menu.key ? sort.dir : null}
          anchor={menu.anchor}
          onApply={(f) => applyFilter(menu.key, f)}
          onSort={(dir) => {
            setSort(dir ? { key: menu.key, dir } : null);
            closeMenu();
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
