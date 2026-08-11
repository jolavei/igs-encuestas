import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { gcsConfigured, signUploadUrl } from "@/lib/gcs";

export const runtime = "nodejs";

const schema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(150),
});

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

// URL firmada para subir el Excel ASQ directo del navegador a GCS. La microdata
// no pertenece a una empresa (es el panel completo), así que va bajo `asq/`.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  if (!gcsConfigured()) {
    return NextResponse.json({ error: "Almacenamiento no configurado." }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  if (!/\.xlsx$/i.test(d.filename)) {
    return NextResponse.json({ error: "Sólo se aceptan archivos .xlsx." }, { status: 400 });
  }

  const objectPath = `asq/departures/${randomUUID()}-${safeName(d.filename)}`;
  const url = await signUploadUrl(objectPath, d.contentType);
  return NextResponse.json({ url, objectPath, fileName: d.filename });
}
