"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Total de columnas del formato definitivo (para mostrar "X/114 reconocidas").
const TOTAL_COLS = 114;

type Report = {
  sheetName: string;
  rowCount: number;
  mappedColumns: string[];
  missingColumns: string[];
  unknownColumns: string[];
  ignoredColumns: string[];
  duplicateHeaders: string[];
  seasons: Record<string, number>;
  airports: Record<string, number>;
  ownAirportRows: number;
  warnings: string[];
};

type Analysis = {
  fileName: string;
  table: string;
  ndjsonBytes: number;
  quarters: string[];
  existingRowsForQuarters: number | null;
  report: Report;
};

type IngestResult = {
  rowCount: number;
  replacedRows: number;
  loadedRows: number;
  loadJobId: string | null;
  quarters: string[];
  table: string;
  ingestId: string;
};

type Phase = "idle" | "uploading" | "analyzing" | "analyzed" | "ingesting" | "done";

const fmt = (n: number) => n.toLocaleString("es-CL");
const humanBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`;
const seasonList = (seasons: Record<string, number>) => Object.keys(seasons).join(", ") || "—";

async function postJson(url: string, body: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? "Ocurrió un error.");
  return data;
}

export default function AsqIngestPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [uploaded, setUploaded] = useState<{ objectPath: string; fileName: string } | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);

  const busy = phase === "uploading" || phase === "analyzing" || phase === "ingesting";

  function reset() {
    setPhase("idle");
    setError(null);
    setAnalysis(null);
    setUploaded(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setAnalysis(null);
    setResult(null);
    if (!/\.xlsx$/i.test(file.name)) {
      setError("El archivo debe ser un .xlsx (formato ACI ASQ Departures).");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    try {
      const contentType =
        file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      // 1) URL firmada + 2) PUT directo a GCS
      setPhase("uploading");
      const s = await postJson("/api/asq/departures/sign-upload", {
        filename: file.name,
        contentType,
      });
      const put = await fetch(s.url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!put.ok) throw new Error("Falló la subida al almacenamiento.");
      setUploaded({ objectPath: s.objectPath, fileName: s.fileName });

      // 3) Analizar (preview, no escribe en BigQuery)
      setPhase("analyzing");
      const a = (await postJson("/api/asq/departures/analyze", {
        objectPath: s.objectPath,
        fileName: s.fileName,
      })) as Analysis;
      setAnalysis(a);
      setPhase("analyzed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar el archivo.");
      setPhase("idle");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onIngest() {
    if (!uploaded) return;
    setError(null);
    setPhase("ingesting");
    try {
      const res = await postJson("/api/asq/departures/ingest", {
        objectPath: uploaded.objectPath,
        fileName: uploaded.fileName,
      });
      setResult(res.result as IngestResult);
      setPhase("done");
      router.refresh(); // actualiza la tabla de historial
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al ingestar.");
      setPhase("analyzed");
    }
  }

  return (
    <div className="card space-y-4">
      {/* --- Zona de carga --- */}
      {phase !== "done" && (
        <div className="flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept=".xlsx" className="hidden" onChange={onFile} />
          <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
            {phase === "uploading"
              ? "Subiendo…"
              : phase === "analyzing"
              ? "Analizando…"
              : analysis
              ? "Elegir otro archivo"
              : "Elegir archivo .xlsx"}
          </button>
          {analysis && !busy && (
            <button className="btn-secondary" onClick={reset} disabled={busy}>
              Cancelar
            </button>
          )}
          <p className="text-sm text-slate-500">
            Archivo ACI ASQ Departures Regional (Data EXCEL Tablet).
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* --- Preview (tras Analizar) --- */}
      {analysis && phase !== "done" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-slate-800">{analysis.fileName}</h3>
              <span className="text-xs text-slate-500">
                hoja «{analysis.report.sheetName}» · {humanBytes(analysis.ndjsonBytes)}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Filas" value={fmt(analysis.report.rowCount)} />
              <Stat
                label="Columnas"
                value={`${analysis.report.mappedColumns.length}/${TOTAL_COLS}`}
              />
              <Stat label="Temporada" value={seasonList(analysis.report.seasons)} />
              <Stat
                label="Filas propias"
                value={`${fmt(analysis.report.ownAirportRows)} / ${fmt(analysis.report.rowCount)}`}
              />
            </div>
          </div>

          {/* Aviso de reemplazo (idempotencia) */}
          {analysis.existingRowsForQuarters === null ? (
            <Note tone="gray">
              No se pudo consultar BigQuery (¿faltan credenciales?). Si la tabla no existe, se creará
              al ingestar.
            </Note>
          ) : analysis.existingRowsForQuarters > 0 ? (
            <Note tone="amber">
              Se <b>reemplazarán {fmt(analysis.existingRowsForQuarters)} filas</b> ya cargadas de{" "}
              {seasonList(analysis.report.seasons)} (se borran y se vuelven a cargar).
            </Note>
          ) : (
            <Note tone="green">
              Carga nueva: no hay filas previas de {seasonList(analysis.report.seasons)} en la tabla.
            </Note>
          )}

          {/* Diagnóstico de columnas */}
          {analysis.report.missingColumns.length > 0 && (
            <Note tone="amber">
              Faltan {analysis.report.missingColumns.length} columnas (quedarán vacías):{" "}
              <span className="font-mono text-xs">{analysis.report.missingColumns.join(", ")}</span>
            </Note>
          )}
          {analysis.report.unknownColumns.length > 0 && (
            <Note tone="gray">
              Columnas no reconocidas (se guardan en <code>_extra</code>):{" "}
              <span className="font-mono text-xs">{analysis.report.unknownColumns.join(", ")}</span>
            </Note>
          )}
          {analysis.report.ignoredColumns.length > 0 && (
            <Note tone="gray">
              Columnas descartadas:{" "}
              <span className="font-mono text-xs">{analysis.report.ignoredColumns.join(", ")}</span>
            </Note>
          )}
          {analysis.report.duplicateHeaders.length > 0 && (
            <Note tone="amber">
              Headers duplicados:{" "}
              <span className="font-mono text-xs">{analysis.report.duplicateHeaders.join(", ")}</span>
            </Note>
          )}

          {/* Aeropuertos */}
          <div>
            <p className="label">Aeropuertos ({Object.keys(analysis.report.airports).length})</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(analysis.report.airports)
                .sort((a, b) => b[1] - a[1])
                .map(([code, n]) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600"
                  >
                    <span className="font-semibold text-slate-800">{code}</span>
                    <span className="text-slate-400">{fmt(n)}</span>
                  </span>
                ))}
            </div>
          </div>

          {/* Acción */}
          <div className="flex items-center gap-3 pt-1">
            <button className="btn" onClick={onIngest} disabled={busy}>
              {phase === "ingesting" ? "Ingestando…" : "Confirmar e ingestar a BigQuery"}
            </button>
            <span className="text-sm text-slate-500">Destino: <code>{analysis.table}</code></span>
          </div>
        </div>
      )}

      {/* --- Resultado --- */}
      {phase === "done" && result && (
        <div className="space-y-3">
          <Note tone="green">
            <b>Ingesta completada.</b> {fmt(result.loadedRows)} filas cargadas
            {result.replacedRows > 0 ? ` · ${fmt(result.replacedRows)} reemplazadas` : ""} · temporada{" "}
            {result.quarters.join(", ")}.
          </Note>
          <p className="text-xs text-slate-500">
            Tabla <code>{result.table}</code>
            {result.loadJobId ? ` · job ${result.loadJobId}` : ""}
          </p>
          <button className="btn" onClick={reset}>
            Cargar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Note({ tone, children }: { tone: "green" | "amber" | "gray"; children: React.ReactNode }) {
  const cls = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    gray: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];
  return <div className={`rounded-md border px-4 py-2.5 text-sm ${cls}`}>{children}</div>;
}
