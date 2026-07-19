"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Company = { id: string; name: string; locations: { id: string; name: string }[] };

// Asocia un aeropuerto ASQ (PMC, IQQ, ...) a una empresa + sede.
export default function AsqAirportMapper({
  airport,
  companyId,
  locationId,
  companies,
}: {
  airport: string;
  companyId: string | null;
  locationId: string | null;
  companies: Company[];
}) {
  const router = useRouter();
  const [cId, setCId] = useState(companyId ?? "");
  const [lId, setLId] = useState(locationId ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locations = companies.find((c) => c.id === cId)?.locations ?? [];

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const r = await fetch("/api/asq-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airport, companyId: cId || null, locationId: lId || null }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setSaved(true);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <select
        className="input sm:w-52"
        value={cId}
        onChange={(e) => {
          setCId(e.target.value);
          setLId("");
          setSaved(false);
        }}
      >
        <option value="">— empresa —</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <select
        className="input sm:w-48"
        value={lId}
        disabled={!cId}
        onChange={(e) => {
          setLId(e.target.value);
          setSaved(false);
        }}
      >
        <option value="">— sede —</option>
        {locations.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <button className="btn shrink-0" disabled={busy} onClick={save}>
        {busy ? "…" : saved ? "✓ Guardado" : "Guardar"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
