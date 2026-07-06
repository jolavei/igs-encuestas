"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewFolderButton({
  companyId,
  locationId,
  parentId,
}: {
  companyId: string;
  locationId: string | null;
  parentId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, locationId, parentId, name }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Error");
      setName("");
      setOpen(false);
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Nueva carpeta
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        className="input w-48"
        autoFocus
        placeholder="Nombre de la carpeta"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && create()}
      />
      <button className="btn" disabled={busy} onClick={create}>
        Crear
      </button>
      <button className="btn-secondary" onClick={() => setOpen(false)}>
        Cancelar
      </button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
