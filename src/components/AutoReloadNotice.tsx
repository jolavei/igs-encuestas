"use client";

import { useEffect, useState } from "react";
import { consumeAutoReloadReason } from "@/lib/reloadBreadcrumb";

// Aviso visible tras una recarga automática (FreshnessGuard o ChunkErrorReload),
// para que quede claro que no fue un error del usuario ni de la funcionalidad que
// estaba usando, y para poder diagnosticar el motivo exacto sin herramientas de
// desarrollador.
export default function AutoReloadNotice() {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    setReason(consumeAutoReloadReason());
  }, []);

  if (!reason) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>
        La página se recargó sola justo ahora ({reason}). Si estabas completando algo, discúlpanos — vuelve a
        intentarlo.
      </span>
      <button
        type="button"
        onClick={() => setReason(null)}
        aria-label="Cerrar aviso"
        className="flex-shrink-0 font-semibold text-amber-900 hover:text-amber-700"
      >
        ✕
      </button>
    </div>
  );
}
