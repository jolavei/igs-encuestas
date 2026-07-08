import { NextResponse } from "next/server";
import { apiUser } from "@/lib/rbac";
import { gcsConfigured, signDownloadUrl } from "@/lib/gcs";

// Descarga de un archivo subido como respuesta. Solo encuestador/admin.
// El path debe estar bajo "answers/" (evita acceder a otros objetos del bucket).
export async function GET(req: Request) {
  const { user, status } = await apiUser(["SURVEYOR", "ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  if (!gcsConfigured()) {
    return NextResponse.json({ error: "Almacenamiento no configurado." }, { status: 503 });
  }

  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path.startsWith("answers/") || path.includes("..")) {
    return NextResponse.json({ error: "Ruta inválida." }, { status: 400 });
  }

  const filename = path.split("__").pop() || "archivo";
  const url = await signDownloadUrl(path, filename);
  return NextResponse.redirect(url);
}
