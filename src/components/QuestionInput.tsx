"use client";
import { useEffect, useRef, useState } from "react";
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
        <DateTimeInput value={value} onChange={set} prevDatetime={prevDatetime} />
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

// Fecha-hora-minuto-SEGUNDO. Los controles de hora nativos (datetime-local / time)
// NO muestran los segundos en Safari iOS/iPadOS (ignoran step="1"). Para lograr un
// campo continuo "DD-MM-AAAA HH:MM:SS" que se vea y edite igual en todos los
// dispositivos, usamos un campo segmentado propio (sin control nativo). Se guarda el
// string "YYYY-MM-DDTHH:MM:SS" en valueText/valueDate (formato sin cambios).
type SegKey = "d" | "mo" | "y" | "h" | "mi" | "s";
type Seg = Record<SegKey, string>;
const SEG_ORDER: SegKey[] = ["d", "mo", "y", "h", "mi", "s"];
const SEG_LEN: Record<SegKey, number> = { d: 2, mo: 2, y: 4, h: 2, mi: 2, s: 2 };
const SEG_MAX: Record<SegKey, number> = { d: 31, mo: 12, y: 9999, h: 23, mi: 59, s: 59 };
const SEG_PH: Record<SegKey, string> = { d: "dd", mo: "mm", y: "aaaa", h: "hh", mi: "mm", s: "ss" };
const SEG_LABEL: Record<SegKey, string> = {
  d: "Día",
  mo: "Mes",
  y: "Año",
  h: "Hora",
  mi: "Minuto",
  s: "Segundo",
};
const EMPTY_SEG: Seg = { d: "", mo: "", y: "", h: "", mi: "", s: "" };

// "YYYY-MM-DDTHH:MM:SS" -> segmentos.
function parseSeg(full: string): Seg {
  if (full.length >= 16) {
    return {
      y: full.slice(0, 4),
      mo: full.slice(5, 7),
      d: full.slice(8, 10),
      h: full.slice(11, 13),
      mi: full.slice(14, 16),
      s: full.length >= 19 ? full.slice(17, 19) : "00",
    };
  }
  return { ...EMPTY_SEG };
}

// segmentos -> "YYYY-MM-DDTHH:MM:SS" (o "" si falta fecha u hora). Segundos opcional (00).
function buildSeg(s: Seg): string {
  if (!s.d || !s.mo || s.y.length < 4 || !s.h || !s.mi) return "";
  const yy = s.y;
  const mm = s.mo.padStart(2, "0");
  const dd = s.d.padStart(2, "0");
  const hh = s.h.padStart(2, "0");
  const mn = s.mi.padStart(2, "0");
  const ss = (s.s || "0").padStart(2, "0");
  return `${yy}-${mm}-${dd}T${hh}:${mn}:${ss}`;
}

function DateTimeInput({
  value,
  onChange,
  prevDatetime,
}: {
  value: RawAnswer;
  onChange: (patch: Partial<RawAnswer>) => void;
  prevDatetime?: string;
}) {
  const full = value.valueText ?? ""; // "YYYY-MM-DDTHH:MM:SS"
  const [seg, setSeg] = useState<Seg>(() => parseSeg(full));
  const segRef = useRef(seg);
  segRef.current = seg;
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  // valueText es la fuente de verdad: el botón "Ahora" y "Nueva respuesta" la cambian
  // desde afuera. Sincroniza los segmentos solo ante cambios externos reales (no cuando
  // el propio tecleo ya coincide con lo guardado), para no pisar lo que se escribe.
  useEffect(() => {
    if (buildSeg(segRef.current) === full) return;
    setSeg(parseSeg(full));
  }, [full]);

  function focusIdx(i: number) {
    const el = refs.current[i];
    if (el) {
      el.focus();
      el.select();
    }
  }

  function onSegChange(key: SegKey, raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, SEG_LEN[key]);
    let next = digits;
    if (next !== "" && Number(next) > SEG_MAX[key]) next = String(SEG_MAX[key]);
    // "Completo" = el segmento ya no admite otro dígito (por longitud o rango, ej. mes 3).
    const canExtend = next.length < SEG_LEN[key] && Number(next + "0") <= SEG_MAX[key];
    const complete = next !== "" && !canExtend;
    if (complete && key !== "y") next = next.padStart(SEG_LEN[key], "0"); // "3" -> "03"
    const newSeg = { ...seg, [key]: next };
    setSeg(newSeg);
    const built = buildSeg(newSeg);
    onChange({ valueText: built, valueDate: built });
    // Auto-avanza al siguiente segmento cuando ya está completo.
    const idx = SEG_ORDER.indexOf(key);
    if (complete && idx < SEG_ORDER.length - 1) focusIdx(idx + 1);
  }

  // Al salir de un segmento con un solo dígito, lo rellena con cero ("7" -> "07").
  function onSegBlur(key: SegKey) {
    if (key === "y") return;
    const cur = segRef.current[key];
    if (cur.length !== 1) return;
    const newSeg = { ...segRef.current, [key]: cur.padStart(2, "0") };
    setSeg(newSeg);
    const built = buildSeg(newSeg);
    onChange({ valueText: built, valueDate: built });
  }

  function onSegKey(key: SegKey, e: React.KeyboardEvent<HTMLInputElement>) {
    const idx = SEG_ORDER.indexOf(key);
    if (e.key === "Backspace" && seg[key] === "" && idx > 0) {
      e.preventDefault();
      focusIdx(idx - 1);
    } else if (e.key === "ArrowLeft" && idx > 0) {
      focusIdx(idx - 1);
    } else if (e.key === "ArrowRight" && idx < SEG_ORDER.length - 1) {
      focusIdx(idx + 1);
    }
  }

  function setNow() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const v = now.toISOString().slice(0, 19); // YYYY-MM-DDTHH:MM:SS local
    onChange({ valueText: v, valueDate: v });
  }

  const renderSeg = (key: SegKey, widthClass: string) => (
    <input
      ref={(el) => {
        refs.current[SEG_ORDER.indexOf(key)] = el;
      }}
      className={`${widthClass} appearance-none border-0 bg-transparent p-0 text-center text-sm tabular-nums text-slate-900 outline-none placeholder:text-slate-300 focus:ring-0`}
      type="text"
      inputMode="numeric"
      maxLength={SEG_LEN[key]}
      placeholder={SEG_PH[key]}
      aria-label={SEG_LABEL[key]}
      value={seg[key]}
      onChange={(e) => onSegChange(key, e.target.value)}
      onKeyDown={(e) => onSegKey(key, e)}
      onFocus={(e) => e.target.select()}
      onBlur={() => onSegBlur(key)}
    />
  );

  return (
    <>
      {/* Campo segmentado continuo "DD-MM-AAAA HH:MM:SS" + "Ahora", en un solo borde. */}
      <div className="flex items-stretch overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500">
        <div className="flex min-w-0 flex-1 items-center py-2.5 pl-3 pr-2">
          {renderSeg("d", "w-[1.15rem]")}
          <span className="select-none text-slate-400">-</span>
          {renderSeg("mo", "w-[1.15rem]")}
          <span className="select-none text-slate-400">-</span>
          {renderSeg("y", "w-[2.2rem]")}
          <span className="w-[0.35rem]" />
          {renderSeg("h", "w-[1.15rem]")}
          <span className="select-none text-slate-400">:</span>
          {renderSeg("mi", "w-[1.15rem]")}
          <span className="select-none text-slate-400">:</span>
          {renderSeg("s", "w-[1.15rem]")}
        </div>
        <button
          type="button"
          className="shrink-0 whitespace-nowrap border-0 border-l border-slate-200 bg-slate-50 px-3 text-[13px] font-semibold text-brand-700 hover:bg-slate-100"
          title="Usar la fecha y hora actual"
          onClick={setNow}
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
