import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { deleteObject } from "@/lib/gcs";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

// Editar un documento (admin): nombre y/o descripción. No toca el binario en GCS.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc || doc.deletedAt) return NextResponse.json({ error: "No existe." }, { status: 404 });

  const d = parsed.data;
  await prisma.document.update({
    where: { id: params.id },
    data: {
      ...(d.name !== undefined ? { name: d.name.trim() } : {}),
      ...(d.description !== undefined ? { description: d.description?.trim() || null } : {}),
    },
  });
  await audit(user.id, "document.update", "Document", params.id, d);
  return NextResponse.json({ ok: true });
}

// Borrar documento (admin): borrado LÓGICO. Elimina el objeto en GCS (libera
// almacenamiento) pero conserva la fila con deletedAt para preservar el histórico
// (nombre, quién subió, cuándo). Los listados y la descarga filtran deletedAt=null.
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const doc = await prisma.document.findUnique({ where: { id: params.id } });
  if (!doc || doc.deletedAt) return NextResponse.json({ error: "No existe." }, { status: 404 });

  await deleteObject(doc.objectPath);
  await prisma.document.update({
    where: { id: params.id },
    data: { deletedAt: new Date() },
  });
  await audit(user.id, "document.delete", "Document", params.id);
  return NextResponse.json({ ok: true });
}
