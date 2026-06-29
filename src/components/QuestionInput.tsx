"use client";
import type { QuestionConfig, QuestionType, RawAnswer } from "@/lib/questionTypes";

export type ClientQuestion = {
  id: string;
  order: number;
  type: QuestionType;
  text: string;
  required: boolean;
  config: QuestionConfig | null;
};

type Props = {
  q: ClientQuestion;
  value: RawAnswer;
  error?: string;
  onChange: (v: RawAnswer) => void;
};

export default function QuestionInput({ q, value, error, onChange }: Props) {
  const cfg = q.config ?? {};

  function set(patch: Partial<RawAnswer>) {
    onChange({ ...value, ...patch, questionId: q.id });
  }

  return (
    <div className="card space-y-3">
      <label className="label">
        {q.text} {q.required && <span className="text-red-500">*</span>}
      </label>

      {q.type === "NPS" && (
        <div className="flex flex-wrap gap-1">
          {Array.from({ length: 11 }, (_, i) => i).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => set({ valueNumber: n })}
              className={`h-9 w-9 rounded-md border text-sm ${
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
            <div className="flex flex-wrap gap-2">
              {range.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => set({ valueNumber: n })}
                  className={`h-10 w-10 rounded-md border text-sm ${
                    value.valueNumber === n
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-slate-300 bg-white"
                  }`}
                >
                  {n}
                </button>
              ))}
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
        <textarea
          className="input"
          rows={3}
          maxLength={cfg.maxLength}
          value={value.valueText ?? ""}
          onChange={(e) => set({ valueText: e.target.value })}
        />
      )}

      {q.type === "DATETIME" && (
        <input
          className="input"
          type="datetime-local"
          value={value.valueText ?? ""}
          onChange={(e) => set({ valueText: e.target.value, valueDate: e.target.value })}
        />
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
