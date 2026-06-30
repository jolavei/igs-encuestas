"use client";
import { useEffect, useRef, useState } from "react";

// Muestra el logo (PNG en /public). Si el archivo aún no existe, cae a un
// respaldo tipográfico de marca para que la UI nunca se vea rota.
export function Logo({
  variant = "full",
  className = "",
}: {
  variant?: "full" | "icon";
  className?: string;
}) {
  const [err, setErr] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const src = variant === "full" ? "/logo.png" : "/icon.png";

  // Captura el caso en que la imagen falló ANTES de hidratar (onError se perdería).
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setErr(true);
  }, []);

  if (err) {
    return variant === "full" ? (
      <span className="select-none text-lg font-bold tracking-tight text-brand-700">
        AERÓDROMOS<span className="text-accent">·IGS</span>
      </span>
    ) : (
      <span className="flex h-8 w-8 select-none items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
        IGS
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt="Aeródromos IGS"
      className={className}
      onError={() => setErr(true)}
    />
  );
}
