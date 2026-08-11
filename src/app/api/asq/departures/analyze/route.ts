import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { gcsConfigured } from "@/lib/gcs";
import { analyzeObject } from "@/lib/asq/ingestService";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  objectPath: z.string().min(1).max(300),
  fileName: z.string().min(1).max(200).optional(),
});

// Preview (NO escribe en BigQuery): parsea el archivo subido, normaliza al esquema
// canónico y devuelve el diagnóstico + cuántas filas se reemplazarían. Es la
// pantalla de confirmación antes de ingestar.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  if (!gcsConfigured()) {
    return NextResponse.json({ error: "Almacenamiento no configurado." }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  try {
    const analysis = await analyzeObject(parsed.data.objectPath, parsed.data.fileName);
    return NextResponse.json({ ok: true, ...analysis });
  } catch (e) {
    const message = e instanceof Error ? e.message : "No se pudo analizar el archivo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
