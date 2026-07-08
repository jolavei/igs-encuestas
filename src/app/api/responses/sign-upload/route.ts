import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { gcsConfigured, signUploadUrl } from "@/lib/gcs";

const schema = z.object({
  filename: z.string().min(1).max(200),
  contentType: z.string().min(1).max(150),
});

// Tipos permitidos como respuesta: pdf, word, excel e imágenes.
function allowedType(ct: string): boolean {
  if (ct.startsWith("image/")) return true;
  return [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ].includes(ct);
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

// URL firmada para que el navegador suba directo a GCS un archivo de respuesta.
// Solo encuestador/admin (el QR público no ofrece este tipo de pregunta).
export async function POST(req: Request) {
  const { user, status } = await apiUser(["SURVEYOR", "ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  if (!gcsConfigured()) {
    return NextResponse.json({ error: "Almacenamiento no configurado." }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;
  if (!allowedType(d.contentType)) {
    return NextResponse.json(
      { error: "Tipo de archivo no permitido (solo pdf, word, excel o imágenes)." },
      { status: 400 }
    );
  }

  // Separador "__" para poder recuperar el nombre visible desde la ruta.
  const objectPath = `answers/${randomUUID()}__${safeName(d.filename)}`;
  const url = await signUploadUrl(objectPath, d.contentType);
  return NextResponse.json({ url, objectPath });
}
