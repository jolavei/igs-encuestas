"use client";
import { useState } from "react";

type Gen = {
  versionNumber: number;
  sources: { fileName: string; content: string };
  table: { fileName: string; content: string };
  mappedColumns: number;
  totalQuestions: number;
};

function CodeBlock({ file }: { file: { fileName: string; content: string } }) {
  const [copied, setCopied] = useState(false);

  function download() {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.fileName.split("/").pop() ?? "definicion.sqlx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-md border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="font-mono text-xs text-slate-600">{file.fileName}</span>
        <div className="flex gap-2">
          <button
            className="text-xs text-brand-600"
            onClick={() => {
              navigator.clipboard.writeText(file.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "✓ copiado" : "copiar"}
          </button>
          <button className="text-xs text-brand-600" onClick={download}>
            descargar
          </button>
        </div>
      </div>
      <pre className="max-h-80 overflow-auto p-3 text-xs leading-relaxed">
        <code>{file.content}</code>
      </pre>
    </div>
  );
}

export default function DataformPanel({ questionnaireId }: { questionnaireId: string }) {
  const [gen, setGen] = useState<Gen | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/questionnaires/${questionnaireId}/dataform`);
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setGen(await r.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">Tabla en BigQuery (Dataform)</h2>
          <p className="text-sm text-slate-500">
            Genera la definición de la tabla ancha de este cuestionario. Commitéala en tu
            repo Dataform conectado a BigQuery.
          </p>
        </div>
        <button className="btn" disabled={busy} onClick={generate}>
          {busy ? "Generando…" : "Generar definición"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {gen && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Versión v{gen.versionNumber} · {gen.mappedColumns} de {gen.totalQuestions}{" "}
            preguntas mapeadas a columnas BQ.
            {gen.mappedColumns === 0 &&
              " (Define el nombre de columna en las preguntas para incluirlas.)"}
          </p>

          <div>
            <p className="mb-1 text-sm font-medium">
              1. Fuentes — crea este archivo una sola vez en tu proyecto Dataform:
            </p>
            <CodeBlock file={gen.sources} />
          </div>

          <div>
            <p className="mb-1 text-sm font-medium">
              2. Tabla del cuestionario — un archivo por cuestionario:
            </p>
            <CodeBlock file={gen.table} />
          </div>
        </div>
      )}
    </div>
  );
}
