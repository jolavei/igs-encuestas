"use client";
import { useState } from "react";
import type { QuestionConfig, QuestionType, RawAnswer } from "@/lib/questionTypes";

export type ClientQuestion = {
  id: string;
  order: number;
  type: QuestionType;
  text: string;
  required: boolean;
  config: QuestionConfig | null;
};

export type ClientSection = {
  order: number;
  title: string;
  description?: string | null;
  routing: string; // "NEXT" | "SUBMIT" | "GOTO:<order>"
  questions: ClientQuestion[];
};

type Props = {
  q: ClientQuestion;
  value: RawAnswer;
  error?: string;
  onChange: (v: RawAnswer) => void;
  canUpload?: boolean; // habilita subir archivos (solo levantamiento de campo)
  prevDatetime?: string; // valor de la pregunta DATETIME anterior (para "Duración de medición")
};

// Formatea segundos como "Xh Ym Zs".
function fmtDur(secs: number): string {
  const s = Math.abs(secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${m}m ${sec}s`;
}

export default function QuestionInput({ q, value, error, onChange, canUpload, prevDatetime }: Props) {
  const cfg = q.config ?? {};

  function set(patch: Partial<RawAnswer>) {
    onChange({ ...value, ...patch, questionId: q.id });
  }

  return (
    <div className="space-y-3 py-5">
      <label className="block text-[15px] font-medium leading-snug text-slate-800">
        {q.text} {q.required && <span className="text-red-500">*</span>}
      </label>

      {q.type === "NPS" && (
        // Los 11 botones (0–10) se reparten el ancho disponible para que siempre
        // quepan en una línea sin desplazamiento horizontal (importante en el QR móvil).
        <div className="flex justify-center gap-1 sm:gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set({ valueNumber: n })}
              className={`flex aspect-square min-w-0 max-w-[2.75rem] flex-1 items-center justify-center rounded-md border text-xs sm:text-sm ${
                value.valueNumber === n
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-300 bg-white"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {q.type === "LIKERT" &&
        (() => {
          const min = cfg.min ?? 1;
          const max = cfg.max ?? 5;
          const range = Array.from({ length: max - min + 1 }, (_, i) => min + i);
          return (
            <div className="overflow-x-auto">
              <div className="flex w-max min-w-full justify-center gap-2">
                {range.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set({ valueNumber: n })}
                    className={`h-10 w-10 shrink-0 rounded-md border text-sm ${
                      value.valueNumber === n
                        ? "border-brand-600 bg-brand-600 text-white"
                        : "border-slate-300 bg-white"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

      {q.type === "NUMBER" && (
        <input
          className="input"
          type="number"
          min={cfg.min}
          max={cfg.max}
          step={cfg.step ?? 1}
          value={value.valueNumber ?? ""}
          onChange={(e) =>
            set({ valueNumber: e.target.value === "" ? null : Number(e.target.value) })
          }
        />
      )}

      {q.type === "TEXT" && (
        <input
          className="input"
          type="text"
          maxLength={cfg.maxLength}
          placeholder="Texto de respuesta breve"
          value={value.valueText ?? ""}
          onChange={(e) => set({ valueText: e.target.value })}
        />
      )}

      {q.type === "PARAGRAPH" && (
        <textarea
          className="input"
          rows={4}
          maxLength={cfg.maxLength}
          placeholder="Texto de respuesta largo"
          value={value.valueText ?? ""}
          onChange={(e) => set({ valueText: e.target.value })}
        />
      )}

      {q.type === "RATING" &&
        (() => {
          const max = cfg.maxStars ?? 5;
          const na = value.valueText === "N/A";
          const current = na ? 0 : value.valueNumber ?? 0;
          return (
            <div className="overflow-x-auto py-2">
              <div className="flex w-max min-w-full items-start justify-center gap-3">
                <button
                  type="button"
                  onClick={() => set({ valueText: "N/A", valueNumber: null })}
                  className="flex shrink-0 flex-col items-center gap-1"
                  aria-label="No aplica"
                >
                  <span className="text-xs text-slate-500">N/A</span>
                  <span
                    className={`h-3.5 w-3.5 rounded border ${
                      na ? "border-brand-600 bg-brand-600" : "border-slate-300 bg-white"
                    }`}
                  />
                </button>
                {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set({ valueNumber: n, valueText: null })}
                    className="flex shrink-0 flex-col items-center gap-1"
                    aria-label={`${n} de ${max}`}
                  >
                    <span className="text-xs text-slate-500">{n}</span>
                    <span
                      className={`text-3xl leading-none ${
                        !na && n <= current ? "text-amber-400" : "text-slate-300"
                      }`}
                    >
                      ★
                    </span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

      {q.type === "DATETIME" && (
        <>
          <div className="flex gap-2">
            <input
              className="input"
              type="datetime-local"
              step="1"
              value={value.valueText ?? ""}
              onChange={(e) => set({ valueText: e.target.value, valueDate: e.target.value })}
            />
            <button
              type="button"
              className="btn-secondary whitespace-nowrap"
              title="Usar la hora actual"
              onClick={() => {
                const now = new Date();
                now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
                const v = now.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS local
                set({ valueText: v, valueDate: v });
              }}
            >
              Ahora
            </button>
          </div>
          {prevDatetime &&
            value.valueText &&
            (() => {
              const d0 = new Date(prevDatetime).getTime();
              const d1 = new Date(value.valueText).getTime();
              if (isNaN(d0) || isNaN(d1)) return null;
              const secs = Math.round((d1 - d0) / 1000);
              const negative = secs < 0;
              const over = secs > 7200;
              return (
                <p
                  className={`text-sm ${
                    negative || over ? "font-medium text-red-600" : "text-slate-600"
                  }`}
                >
                  {negative
                    ? "Duración de medición negativa"
                    : `Duración de medición: ${fmtDur(secs)}${
                        over ? " — excede las 2 horas, corrige para continuar" : ""
                      }`}
                </p>
              );
            })()}
        </>
      )}

      {q.type === "SINGLE_CHOICE" && (
        <div className="space-y-2">
          {(cfg.options ?? []).map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={q.id}
                checked={value.valueText === o.value}
                onChange={() => set({ valueText: o.value })}
              />
              {o.label}
            </label>
          ))}
        </div>
      )}

      {q.type === "DROPDOWN" && (
        <select
          className="input"
          value={value.valueText ?? ""}
          onChange={(e) => set({ valueText: e.target.value })}
        >
          <option value="">— elegir —</option>
          {(cfg.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}

      {q.type === "FILE_UPLOAD" &&
        (canUpload ? (
          <FileUploadInput value={value} config={cfg} onChange={set} />
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 p-3 text-center text-sm text-slate-400">
            Carga de archivos (solo disponible en levantamiento de campo).
          </div>
        ))}

      {q.type === "MULTI_CHOICE" && (
        <div className="space-y-2">
          {(cfg.options ?? []).map((o) => {
            const arr = (value.valueJson as string[]) ?? [];
            const checked = arr.includes(o.value);
            return (
              <label key={o.value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    set({
                      valueJson: checked
                        ? arr.filter((v) => v !== o.value)
                        : [...arr, o.value],
                    })
                  }
                />
                {o.label}
              </label>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// Sube archivos directo a GCS (URL firmada) y guarda las rutas en valueJson.
function FileUploadInput({
  value,
  config,
  onChange,
}: {
  value: RawAnswer;
  config: QuestionConfig;
  onChange: (patch: Partial<RawAnswer>) => void;
}) {
  const paths = (value.valueJson as string[]) ?? [];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const maxFiles = config.maxFiles ?? 5;
  const nameOf = (p: string) => p.split("__").pop() ?? p;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setErr(null);
    try {
      const added: string[] = [];
      for (const f of files) {
        if (paths.length + added.length >= maxFiles) break;
        const ct = f.type || "application/octet-stream";
        const sign = await fetch("/api/responses/sign-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: f.name, contentType: ct }),
        });
        if (!sign.ok) throw new Error((await sign.json()).error ?? "No se pudo preparar la subida.");
        const { url, objectPath } = await sign.json();
        const put = await fetch(url, { method: "PUT", headers: { "Content-Type": ct }, body: f });
        if (!put.ok) throw new Error("Falló la subida al almacenamiento.");
        added.push(objectPath);
      }
      onChange({ valueJson: [...paths, ...added] });
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
        onChange={onPick}
        disabled={busy || paths.length >= maxFiles}
        className="block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-brand-700"
      />
      {busy && <p className="text-xs text-slate-400">Subiendo…</p>}
      {err && <p className="text-xs text-red-600">{err}</p>}
      {paths.length > 0 && (
        <ul className="space-y-1">
          {paths.map((p) => (
            <li
              key={p}
              className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-sm"
            >
              <span className="truncate">{nameOf(p)}</span>
              <button
                type="button"
                onClick={() => onChange({ valueJson: paths.filter((x) => x !== p) })}
                className="ml-2 text-slate-400 hover:text-red-600"
                aria-label="Quitar archivo"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
