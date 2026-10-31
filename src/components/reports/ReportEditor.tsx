"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReportPhotos from "@/components/reports/ReportPhotos";
import ReadinessChip from "@/components/reports/ReadinessChip";
import { pauseAutoReload } from "@/lib/freshnessGuardPause";
import {
  enabledKeys,
  moduleDef,
  moduleLabel,
  type ModuleKey,
  type ModuleNotes,
  type TemplateEntry,
} from "@/lib/reports/modules";
import { buildOutline, outlineInputFrom, slideLabel } from "@/lib/reports/outline";
import type { ReportKind } from "@/lib/reports/period";
import type { EditionState } from "@/lib/reports/editions";
import type { ModuleReadiness } from "@/lib/reports/readiness";

type OutlineData = Parameters<typeof outlineInputFrom>[0];

// Ayuda bajo el texto de cada módulo (por defecto: «Análisis · X» al final del módulo).
function noteHint(key: ModuleKey, kind: ReportKind, label: string): string {
  if (key === "analisis")
    return kind === "MENSUAL"
      ? "Resumen del mes y recomendaciones. Sale como diapositiva «Análisis y recomendaciones»."
      : "Va en la primera diapositiva, «Resumen ejecutivo», junto a las cifras clave de la temporada.";
  if (key === "recomendaciones") return "Sale como diapositiva «Recomendaciones» al final del informe.";
  return `Si escribes algo, se agrega «Análisis · ${label}» al final del módulo.`;
}

function notePlaceholder(key: ModuleKey, kind: ReportKind): string {
  if (key === "analisis") return kind === "MENSUAL" ? "Análisis y recomendaciones del mes…" : "Hallazgos principales de la temporada…";
  if (key === "recomendaciones") return "Recomendaciones priorizadas para el aeropuerto…";
  return "Análisis de este módulo (opcional)…";
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );

// Editor de una edición de informe: encender/apagar módulos, escribir el análisis por
// módulo y los comentarios, adjuntar fotos y ver la secuencia de diapositivas que se
// generará (la misma que usan el informe HTML y el PPTX).
export default function ReportEditor({
  airport,
  kind,
  periodKey,
  focusSeason,
  focusOptions,
  urls,
  initial,
  readiness,
  outlineData,
}: {
  airport: string;
  kind: ReportKind;
  periodKey: string;
  focusSeason: string | null; // anual: temporada de detalle
  focusOptions: { value: string; label: string }[];
  urls: { view: string; pptx: string; edit: string };
  initial: EditionState;
  readiness: ModuleReadiness;
  outlineData: OutlineData;
}) {
  const [entries, setEntries] = useState<TemplateEntry[]>(initial.entries);
  const [notes, setNotes] = useState<ModuleNotes>(initial.notes);
  const [comentarios, setComentarios] = useState(initial.comentarios);
  const [photosCount, setPhotosCount] = useState(0);
  const [status, setStatus] = useState(initial.status);
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const [emittedAt, setEmittedAt] = useState(initial.emittedAt);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Con cambios sin guardar: no dejar que la autorecarga por deploy nuevo (FreshnessGuard)
  // borre el texto, y avisar antes de cerrar la pestaña.
  const releaseRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (dirty && !releaseRef.current) releaseRef.current = pauseAutoReload();
    if (!dirty && releaseRef.current) {
      releaseRef.current();
      releaseRef.current = null;
    }
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => () => releaseRef.current?.(), []);

  const onPhotos = useCallback((n: number) => setPhotosCount(n), []);

  const modules = enabledKeys(entries);
  const outlineInput = outlineInputFrom(outlineData, { modules, notes, comentarios, photosCount });
  const slides = buildOutline(outlineInput);

  function toggle(key: ModuleKey, enabled: boolean) {
    setEntries((es) => es.map((e) => (e.key === key ? { ...e, enabled } : e)));
    setDirty(true);
  }

  async function save(nextStatus?: "BORRADOR" | "EMITIDO", focus?: string): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/reports/editions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          airport,
          kind,
          periodKey,
          modules: Object.fromEntries(entries.map((e) => [e.key, e.enabled])),
          notes,
          comentarios,
          focusSeason: focus ?? focusSeason,
          ...(nextStatus ? { status: nextStatus } : {}),
        }),
      });
      const j = (await res.json().catch(() => null)) as { edition?: EditionState; error?: string } | null;
      if (!res.ok || !j?.edition) throw new Error(j?.error || "No se pudo guardar la edición.");
      setStatus(j.edition.status);
      setSavedAt(j.edition.updatedAt);
      setEmittedAt(j.edition.emittedAt);
      setDirty(false);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function openReport() {
    // La pestaña se abre antes del guardado para que el navegador no la bloquee.
    const w = window.open("about:blank", "_blank");
    if (dirty && !(await save())) {
      w?.close();
      return;
    }
    if (w) w.location.href = urls.view;
    else window.location.href = urls.view;
  }

  async function downloadPptx() {
    if (dirty && !(await save())) return;
    window.location.href = urls.pptx;
  }

  // Anual: cambiar la temporada de detalle guarda la edición y recarga sus datos.
  async function changeFocus(code: string) {
    if (!(await save(undefined, code))) return;
    window.location.href = urls.edit.replace(/foco=[^&]+/, `foco=${code}`);
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        {focusOptions.length > 0 && (
          <div className="card flex flex-wrap items-center justify-between gap-3 !p-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Temporada de detalle</p>
              <p className="text-xs text-slate-500">
                Las diapositivas de tiempos y AGA muestran esta temporada en detalle; los gráficos mensuales cubren el año.
              </p>
            </div>
            <select
              value={focusSeason ?? ""}
              onChange={(ev) => changeFocus(ev.target.value)}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {focusOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {entries.map((e) => {
          const def = moduleDef(e.key)!;
          const label = moduleLabel(def, kind);
          // Módulo que este tipo de informe aún no genera (ACI ASQ resultados: fase 3).
          const pending = !def.ready.includes(kind);
          // Fotos/comentarios y análisis se editan aquí mismo: su estado del servidor quedaría desfasado.
          const serverReady =
            e.key === "fotos-comentarios" || e.key === "analisis" || e.key === "recomendaciones" ? undefined : readiness[e.key];
          const ready = pending
            ? { state: "off" as const, text: `Próxima fase${serverReady ? ` · ${serverReady.text}` : ""}` }
            : serverReady;
          const na = ready?.state === "na";
          const on = e.enabled && !na && !pending;
          return (
            <div key={e.key} className={`card !p-4 ${on ? "" : "bg-slate-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className={`flex items-center gap-2 text-sm font-semibold ${na ? "text-slate-400" : "text-slate-800"}`}>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={na || pending}
                    onChange={(ev) => toggle(e.key, ev.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  {label}
                </label>
                {ready && <ReadinessChip state={ready.state} text={na ? `No aplica · ${ready.text.toLowerCase()}` : ready.text} />}
              </div>
              <p className="ml-6 mt-0.5 text-xs text-slate-500">{def.source}</p>

              {on && e.key === "fotos-comentarios" && (
                <div className="ml-6 mt-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Comentarios y sugerencias
                  </label>
                  <textarea
                    value={comentarios}
                    onChange={(ev) => {
                      setComentarios(ev.target.value);
                      setDirty(true);
                    }}
                    rows={4}
                    maxLength={3000}
                    placeholder="Opcional. Si escribes algo, se agrega la diapositiva «Comentarios y sugerencias»."
                    className="input mt-1 resize-y"
                  />
                  <ReportPhotos airport={airport} mes={periodKey} onCountChange={onPhotos} />
                </div>
              )}

              {on && def.notes && (
                <div className="ml-6 mt-3">
                  <textarea
                    value={notes[e.key] ?? ""}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      setNotes((n) => ({ ...n, [e.key]: v }));
                      setDirty(true);
                    }}
                    rows={e.key === "analisis" || e.key === "recomendaciones" ? 4 : 2}
                    maxLength={3000}
                    placeholder={notePlaceholder(e.key, kind)}
                    className="input resize-y"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    {noteHint(e.key, kind, label)}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="card !p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Diapositivas que se generarán</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                status === "EMITIDO" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {status === "EMITIDO" ? "Emitido" : "Borrador"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {slides.length} diapositivas · mismo orden en el informe y en el PPTX
          </p>
          <ol className="mt-3 max-h-[55vh] overflow-y-auto border-t border-slate-100">
            {slides.map((s, i) => (
              <li
                key={i}
                className={`grid grid-cols-[1.75rem_minmax(0,1fr)] gap-1 border-b border-slate-100 py-1.5 text-sm ${
                  s.type === "section" ? "font-semibold text-brand-700" : "text-slate-700"
                }`}
              >
                <span className="font-mono text-xs leading-5 text-slate-400">{i + 1}</span>
                <span className="truncate">{slideLabel(s, outlineInput)}</span>
              </li>
            ))}
          </ol>

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <p className="mt-3 text-xs text-slate-500">
            {dirty
              ? "Cambios sin guardar."
              : status === "EMITIDO" && emittedAt
                ? `Emitido el ${fmtTime(emittedAt)}`
                : savedAt
                  ? `Guardado el ${fmtTime(savedAt)}`
                  : "Aún no se ha guardado."}
          </p>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => save()}
              disabled={saving || !dirty}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => save(status === "EMITIDO" ? "BORRADOR" : "EMITIDO")}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {status === "EMITIDO" ? "Volver a borrador" : "Marcar como emitido"}
            </button>
            <button
              type="button"
              onClick={downloadPptx}
              disabled={saving}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              Descargar PPTX
            </button>
            <button
              type="button"
              onClick={openReport}
              disabled={saving}
              className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
            >
              Ver informe →
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
