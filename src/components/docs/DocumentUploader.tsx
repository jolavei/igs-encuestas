"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Sube el archivo directo a GCS (URL firmada) y luego registra el documento.
export default function DocumentUploader({
  companyId,
  locationId,
  folderId,
}: {
  companyId: string;
  locationId: string | null;
  folderId: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const contentType = file.type || "application/octet-stream";
      // 1. URL firmada
      const s = await fetch("/api/documents/sign-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, locationId, filename: file.name, contentType }),
      });
      if (!s.ok) throw new Error((await s.json()).error ?? "No se pudo iniciar la subida.");
      const { url, objectPath } = await s.json();

      // 2. PUT directo a GCS
      const put = await fetch(url, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
      if (!put.ok) throw new Error("Falló la subida al almacenamiento.");

      // 3. Registrar
      const r = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          locationId,
          folderId,
          name: file.name,
          objectPath,
          contentType,
          size: file.size,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "No se pudo registrar el archivo.");
      router.refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input ref={inputRef} type="file" className="hidden" onChange={onFile} />
      <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? "Subiendo…" : "Subir archivo"}
      </button>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
