import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  companyId: z.string(),
  locationId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  name: z.string().min(1).max(120),
});

// Crear carpeta (admin).
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  // Si hay carpeta padre, hereda empresa/sede del padre (coherencia).
  if (d.parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: d.parentId } });
    if (!parent) return NextResponse.json({ error: "Carpeta padre no existe." }, { status: 400 });
  }

  const folder = await prisma.folder.create({
    data: {
      companyId: d.companyId,
      locationId: d.locationId || null,
      parentId: d.parentId || null,
      name: d.name.trim(),
      createdById: user.id,
    },
  });
  await audit(user.id, "folder.create", "Folder", folder.id, { name: d.name });
  return NextResponse.json({ id: folder.id }, { status: 201 });
}
