import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { canAccessDoc } from "@/lib/docsAccess";
import { gcsConfigured, signDownloadUrl } from "@/lib/gcs";

// Descarga con control de acceso: admin, o el cliente de esa empresa+sede.
// Genera una URL firmada corta y redirige.
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "No existe." }, { status: 404 });

  if (!canAccessDoc(user, doc)) {
    return NextResponse.json({ error: "Sin acceso." }, { status: 403 });
  }
  if (!gcsConfigured()) {
    return NextResponse.json({ error: "Almacenamiento no configurado." }, { status: 503 });
  }

  const url = await signDownloadUrl(doc.objectPath, doc.name);
  return NextResponse.redirect(url);
}
