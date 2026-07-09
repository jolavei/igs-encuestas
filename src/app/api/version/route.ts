import { NextResponse } from "next/server";
import { getAppVersion } from "@/lib/version";

// Endpoint liviano (solo lee una variable de entorno, sin base de datos) que
// el FreshnessGuard consulta para saber si hay una versión nueva publicada.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { version: getAppVersion() },
    { headers: { "Cache-Control": "no-store" } }
  );
}
