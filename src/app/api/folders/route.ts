import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { validateDocTarget } from "@/lib/refIntegrity";

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

  // Integridad referencial: empresa/sede coherentes y, si hay carpeta padre, que
  // sea de la misma empresa y sede (antes solo se comprobaba que el padre existiera).
  const refError = await validateDocTarget({
    companyId: d.companyId,
    locationId: d.locationId ?? null,
    folderId: d.parentId ?? null,
  });
  if (refError) return NextResponse.json({ error: refError }, { status: 400 });

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
