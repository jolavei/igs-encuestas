import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  companyId: z.string(),
  locationId: z.string().optional().nullable(),
  folderId: z.string().optional().nullable(),
  name: z.string().min(1).max(200),
  objectPath: z.string().min(1),
  contentType: z.string().min(1).max(150),
  size: z.number().int().min(0),
});

// Registrar el documento después de subirlo a GCS (admin).
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  const doc = await prisma.document.create({
    data: {
      companyId: d.companyId,
      locationId: d.locationId || null,
      folderId: d.folderId || null,
      name: d.name.trim(),
      objectPath: d.objectPath,
      contentType: d.contentType,
      size: d.size,
      uploadedById: user.id,
    },
  });
  await audit(user.id, "document.create", "Document", doc.id, { name: d.name });
  return NextResponse.json({ id: doc.id }, { status: 201 });
}
