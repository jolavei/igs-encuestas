// Rate limiter simple en memoria (ventana fija por clave, normalmente IP).
// Protege endpoints públicos (QR) de spam/saturación sin dependencias externas.
//
// NOTA serverless: en Vercel la memoria es por-instancia y se reinicia en cold start,
// así que esto es "mejor esfuerzo". Para límites globales estrictos, migrar a Upstash
// Redis (@upstash/ratelimit) — ver docs/security.md.

import { NextResponse } from "next/server";

type Entry = { count: number; resetAt: number };
const store = new Map<string, Entry>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();

  // Limpieza ocasional para que el Map no crezca sin control.
  if (store.size > 5000) {
    for (const [k, v] of store) if (now > v.resetAt) store.delete(k);
  }

  const e = store.get(key);
  if (!e || now > e.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (e.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  }
  e.count++;
  return { ok: true, retryAfter: 0 };
}

// IP del cliente detrás del proxy de Vercel.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Aplica rate limit y devuelve una respuesta 429 si se excede, o null si pasa.
 * Uso: `const limited = enforceRateLimit(req, "public-post", 8, 60_000); if (limited) return limited;`
 */
export function enforceRateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowMs: number
): NextResponse | null {
  const { ok, retryAfter } = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (ok) return null;
  return NextResponse.json(
    { error: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}
