"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type Loc = { id: string; name: string; city: string | null; address: string | null };
type Company = { id: string; name: string; kind: string; locations: Loc[] };

const KINDS = [
  { value: "hotel", label: "Hotel" },
  { value: "aeropuerto", label: "Aeropuerto" },
  { value: "clinica", label: "Clínica" },
  { value: "otro", label: "Otro" },
];

// Edición de una sede (nombre / ciudad / dirección) con guardar y eliminar.
function SedeRow({ loc, onChanged }: { loc: Loc; onChanged: () => void }) {
  const [name, setName] = useState(loc.name);
  const [city, setCity] = useState(loc.city ?? "");
  const [address, setAddress] = useState(loc.address ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/locations/${loc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city: city || null, address: address || null }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar la sede "${loc.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/locations/${loc.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3">
      <input
        className="input"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nombre sede"
      />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          className="input"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Ciudad"
        />
        <input
          className="input"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Dirección"
        />
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-secondary" disabled={busy} onClick={save}>
          {busy ? "…" : "Guardar sede"}
        </button>
        <button
          className="text-sm text-red-600 hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={remove}
        >
          Eliminar
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function Modal({
  company,
  onClose,
  onSaved,
}: {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(company.name);
  const [kind, setKind] = useState(company.kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si el tipo actual no está en la lista, lo agregamos para no perderlo.
  const kinds = KINDS.some((k) => k.value === company.kind)
    ? KINDS
    : [{ value: company.kind, label: company.kind }, ...KINDS];

  async function saveCompany() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/companies/${company.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kind }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      onSaved();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[32rem] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Editar empresa</h2>
          <button
            onClick={onClose}
            className="text-xl leading-none text-slate-400 hover:text-slate-600"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="label">Nombre</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {kinds.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn" disabled={busy} onClick={saveCompany}>
            {busy ? "Guardando…" : "Guardar empresa"}
          </button>
        </div>

        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="mb-2 font-semibold">Sedes</h3>
          {company.locations.length === 0 ? (
            <p className="text-sm text-slate-400">Sin sedes.</p>
          ) : (
            <div className="space-y-3">
              {company.locations.map((l) => (
                <SedeRow key={l.id} loc={l} onChanged={onSaved} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function CompanyEditor({ company }: { company: Company }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button className="btn-secondary shrink-0" onClick={() => setOpen(true)}>
        Editar
      </button>
      {mounted &&
        open &&
        createPortal(
          <Modal
            company={company}
            onClose={() => setOpen(false)}
            onSaved={() => router.refresh()}
          />,
          document.body
        )}
    </>
  );
}
