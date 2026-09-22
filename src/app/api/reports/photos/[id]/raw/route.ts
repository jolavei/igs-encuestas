import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { gcsConfigured, downloadObject } from "@/lib/gcs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sirve el binario de una foto del informe (admin), proxeado desde GCS. Se usa como
// `src` de <img> tanto en el panel de edición como en la vista imprimible del informe,
// evitando exponer URLs firmadas o el objectPath del bucket.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const photo = await prisma.reportPhoto.findUnique({ where: { id: params.id } });
  if (!photo) return NextResponse.json({ error: "No existe." }, { status: 404 });
  if (!gcsConfigured()) return NextResponse.json({ error: "Almacenamiento no configurado." }, { status: 503 });

  const bytes = await downloadObject(photo.objectPath);
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "private, max-age=300",
    },
  });
}
