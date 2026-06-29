"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "textarea" | "select" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
};

export default function PostForm({
  endpoint,
  fields,
  submitLabel = "Guardar",
  onSuccess,
}: {
  endpoint: string;
  fields: Field[];
  submitLabel?: string;
  onSuccess?: (data: any) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, any> = {};
      for (const f of fields) {
        let v = values[f.name];
        if (f.type === "number") v = v === undefined || v === "" ? undefined : Number(v);
        if (f.type === "checkbox") v = !!v;
        body[f.name] = v ?? null;
      }
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      const data = await r.json();
      setValues({});
      onSuccess?.(data);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {fields.map((f) => (
        <div key={f.name}>
          {f.type !== "checkbox" && <label className="label">{f.label}</label>}
          {f.type === "textarea" ? (
            <textarea
              className="input"
              rows={2}
              required={f.required}
              placeholder={f.placeholder}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
            />
          ) : f.type === "select" ? (
            <select
              className="input"
              required={f.required}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
            >
              <option value="">— elegir —</option>
              {f.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : f.type === "checkbox" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!values[f.name]}
                onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.checked }))}
              />
              {f.label}
            </label>
          ) : (
            <input
              className="input"
              type={f.type ?? "text"}
              required={f.required}
              placeholder={f.placeholder}
              value={values[f.name] ?? ""}
              onChange={(e) => setValues((s) => ({ ...s, [f.name]: e.target.value }))}
            />
          )}
        </div>
      ))}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn" disabled={busy}>
        {busy ? "Guardando…" : submitLabel}
      </button>
    </form>
  );
}
