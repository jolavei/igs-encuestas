import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { deleteObject } from "@/lib/gcs";

const patchSchema = z.object({
  caption: z.string().max(200).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

// Editar la descripción y/o el orden de una foto (admin). No toca el binario en GCS.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const photo = await prisma.reportPhoto.findUnique({ where: { id: params.id } });
  if (!photo) return NextResponse.json({ error: "No existe." }, { status: 404 });

  const d = parsed.data;
  await prisma.reportPhoto.update({
    where: { id: params.id },
    data: {
      ...(d.caption !== undefined ? { caption: d.caption?.trim() || null } : {}),
      ...(d.order !== undefined ? { order: d.order } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}

// Borrar una foto (admin): elimina el objeto en GCS y la fila. A diferencia de
// Documentos, no requiere borrado lógico (no hay obligación de conservar el histórico
// de fotos de un informe).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const photo = await prisma.reportPhoto.findUnique({ where: { id: params.id } });
  if (!photo) return NextResponse.json({ error: "No existe." }, { status: 404 });

  await deleteObject(photo.objectPath);
  await prisma.reportPhoto.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
