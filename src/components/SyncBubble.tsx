function fmtDateTime(d: Date) {
  // No se puede mezclar dateStyle con hour/minute: se usan componentes individuales.
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

// Burbuja de estado con punto verde parpadeante: "Última sincronización: dd-mm-aaaa, hh:mm".
// Si no hay fecha, queda en gris con "Aún sin sincronizar".
export default function SyncBubble({
  syncedAt,
  title,
}: {
  syncedAt: Date | null;
  title?: string;
}) {
  if (!syncedAt) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
        <span className="inline-flex h-2 w-2 rounded-full bg-slate-400" />
        Aún sin sincronizar
      </span>
    );
  }

  return (
    <span
      title={title}
      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Última sincronización: {fmtDateTime(syncedAt)}
    </span>
  );
}
