import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { gcsConfigured, signUploadUrl } from "@/lib/gcs";

const schema = z.object({
  companyId: z.string(),
  locationId: z.string().optional().nullable(),
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(150),
});

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

// Devuelve una URL firmada para que el navegador suba el archivo directo a GCS.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  if (!gcsConfigured()) {
    return NextResponse.json({ error: "Almacenamiento no configurado." }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  const objectPath = `${d.companyId}/${d.locationId || "general"}/${randomUUID()}-${safeName(d.filename)}`;
  const url = await signUploadUrl(objectPath, d.contentType);
  return NextResponse.json({ url, objectPath });
}
