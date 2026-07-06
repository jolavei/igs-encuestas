"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Botón de borrado reutilizable para carpetas y documentos (admin).
export default function DeleteButton({
  endpoint,
  confirmText,
  label = "Borrar",
}: {
  endpoint: string;
  confirmText: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const r = await fetch(endpoint, { method: "DELETE" });
      if (!r.ok) {
        alert((await r.json()).error ?? "No se pudo borrar.");
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
      disabled={busy}
      onClick={del}
    >
      {label}
    </button>
  );
}
