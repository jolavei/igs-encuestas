"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";

type Loc = { id: string; name: string };
type Token = { id: string; token: string; locationName: string; active: boolean };

function QrImage({ url }: { url: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(url, { width: 180, margin: 1 }).then(setSrc);
  }, [url]);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="QR" width={180} height={180} />
  ) : null;
}

export default function QrManager({
  questionnaireId,
  locations,
  tokens,
}: {
  questionnaireId: string;
  locations: Loc[];
  tokens: Token[];
}) {
  const router = useRouter();
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  async function create() {
    if (!locationId) return;
    setBusy(true);
    await fetch("/api/qrtokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionnaireId, locationId }),
    });
    setBusy(false);
    setLocationId("");
    router.refresh();
  }

  return (
    <div className="card space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-semibold">Códigos QR por sede</h2>
          <p className="text-sm text-slate-500">Estable: apunta siempre a la versión activa.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className="input sm:w-56"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            <option value="">— elegir sede —</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <button className="btn shrink-0" disabled={busy || !locationId} onClick={create}>
            Generar QR
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        {tokens.map((t) => {
          const url = `${origin}/s/${t.token}`;
          return (
            <div key={t.id} className="rounded-md border border-slate-200 p-3 text-center">
              <p className="mb-2 text-sm font-medium">{t.locationName}</p>
              {origin && <QrImage url={url} />}
              <a
                href={url}
                target="_blank"
                className="mt-2 block truncate text-xs text-brand-600"
              >
                {url}
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
