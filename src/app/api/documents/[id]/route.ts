import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { deleteObject } from "@/lib/gcs";

// Borrar documento (admin): elimina el registro y el objeto en GCS.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc) return NextResponse.json({ error: "No existe." }, { status: 404 });

  await deleteObject(doc.objectPath);
  await prisma.document.delete({ where: { id: params.id } });
  await audit(user.id, "document.delete", "Document", params.id);
  return NextResponse.json({ ok: true });
}
