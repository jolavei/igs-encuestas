"use client";

import { useEffect, useRef, useState } from "react";
import { pauseAutoReload } from "@/lib/freshnessGuardPause";

// Panel de fotografías del informe: adjuntar desde el computador, describir cada una
// y reordenarlas. Se suben directo a GCS (URL firmada) y quedan guardadas para este
// aeropuerto y mes (a diferencia del comentario, que es texto libre no persistido).
// Se agregan en una diapositiva "Fotografías" (máx. 4 por diapositiva) justo después
// de "Comentarios y sugerencias", tanto en el informe HTML como en el PPTX.

type Photo = { id: string; caption: string | null; order: number; url: string };

export default function ReportPhotos({ airport, mes }: { airport: string; mes: string }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const releasePauseRef = useRef<(() => void) | null>(null);
  const cancelPauseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al abrir el selector nativo de archivos, el navegador le quita y devuelve el
  // foco a la pestaña — justo lo que dispara el chequeo de "hay versión nueva,
  // recargar" (ver FreshnessGuard). Si un deploy aterriza en ese instante, la
  // recarga completa borraría el comentario y la selección en curso. Pausamos
  // ese chequeo mientras el diálogo puede estar abierto; si se cancela (no
  // dispara `onChange`), se libera sola a los 20s.
  function beginPickerPause() {
    releasePauseRef.current?.();
    releasePauseRef.current = pauseAutoReload();
    if (cancelPauseTimeoutRef.current) clearTimeout(cancelPauseTimeoutRef.current);
    cancelPauseTimeoutRef.current = setTimeout(() => {
      releasePauseRef.current?.();
      releasePauseRef.current = null;
    }, 20000);
  }

  function endPickerPause() {
    if (cancelPauseTimeoutRef.current) {
      clearTimeout(cancelPauseTimeoutRef.current);
      cancelPauseTimeoutRef.current = null;
    }
    releasePauseRef.current?.();
    releasePauseRef.current = null;
  }

  async function load() {
    try {
      const res = await fetch(`/api/reports/photos?airport=${encodeURIComponent(airport)}&mes=${mes}`);
      if (res.ok) {
        const j = (await res.json()) as { photos: Photo[] };
        setPhotos(j.photos);
      }
    } catch {
      // silencioso: el panel simplemente queda sin fotos precargadas
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [airport, mes]);

  useEffect(() => endPickerPause, []);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    // Hubo una selección real: cancelar el auto-liberado de la pausa (arrancado en
    // el click) y mantenerla activa durante toda la subida, no solo el diálogo.
    if (cancelPauseTimeoutRef.current) {
      clearTimeout(cancelPauseTimeoutRef.current);
      cancelPauseTimeoutRef.current = null;
    }
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const signRes = await fetch("/api/reports/photos/sign-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ airport, mes, filename: file.name, contentType: file.type }),
        });
        if (!signRes.ok) {
          const j = (await signRes.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error || "No se pudo iniciar la subida.");
        }
        const { url, objectPath } = (await signRes.json()) as { url: string; objectPath: string };

        const putRes = await fetch(url, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!putRes.ok) throw new Error("Falló la subida de la imagen.");

        const regRes = await fetch("/api/reports/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ airport, mes, objectPath, contentType: file.type, size: file.size }),
        });
        if (!regRes.ok) throw new Error("No se pudo registrar la foto.");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al subir imágenes.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      endPickerPause();
    }
  }

  async function saveCaption(id: string, caption: string) {
    setPhotos((ps) => ps.map((p) => (p.id === id ? { ...p, caption } : p)));
    await fetch(`/api/reports/photos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption }),
    });
  }

  async function remove(id: string) {
    setPhotos((ps) => ps.filter((p) => p.id !== id));
    await fetch(`/api/reports/photos/${id}`, { method: "DELETE" });
  }

  async function move(id: string, dir: -1 | 1) {
    const idx = photos.findIndex((p) => p.id === id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= photos.length) return;
    const next = [...photos];
    [next[idx], next[j]] = [next[j], next[idx]];
    setPhotos(next);
    await Promise.all(
      next.map((p, i) =>
        fetch(`/api/reports/photos/${p.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i }),
        })
      )
    );
  }

  return (
    <div className="mt-4 border-t border-slate-200 pt-3">
      <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Fotografías</label>
      <p className="mt-1 text-xs text-slate-500">
        Opcional. Se agregan en una diapositiva “Fotografías” (máx. 4 por diapositiva, con su descripción abajo)
        justo después de “Comentarios y sugerencias” — en el informe y en el PPTX. Quedan guardadas para este
        aeropuerto y mes.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onClick={beginPickerPause}
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading}
        className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-brand-700 disabled:opacity-50"
      />
      {uploading && <p className="mt-2 text-xs text-slate-500">Subiendo…</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {photos.length > 0 && (
        <ul className="mt-3 space-y-2">
          {photos.map((p, i) => (
            <li key={p.id} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="h-14 w-14 flex-shrink-0 rounded object-cover" />
              <input
                type="text"
                defaultValue={p.caption ?? ""}
                maxLength={200}
                placeholder="Descripción breve…"
                onBlur={(e) => saveCaption(p.id, e.target.value)}
                className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <div className="flex flex-shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(p.id, -1)}
                  disabled={i === 0}
                  aria-label="Subir"
                  className="px-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(p.id, 1)}
                  disabled={i === photos.length - 1}
                  aria-label="Bajar"
                  className="px-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="flex-shrink-0 self-center text-xs text-red-600 hover:underline"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
