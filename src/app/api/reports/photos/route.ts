import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { isValidMonth } from "@/lib/reports/monthlyReport";

// Listar las fotos de un informe (aeropuerto + mes), con una URL para mostrarlas
// (proxeadas por /api/reports/photos/[id]/raw, sin exponer el objectPath de GCS).
export async function GET(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const url = new URL(req.url);
  const airport = (url.searchParams.get("airport") || "").trim().toUpperCase();
  const mes = url.searchParams.get("mes") || "";
  if (!airport || !isValidMonth(mes)) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }

  const rows = await prisma.reportPhoto.findMany({
    where: { airport, mes },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, caption: true, order: true },
  });
  const photos = rows.map((r) => ({ ...r, url: `/api/reports/photos/${r.id}/raw` }));
  return NextResponse.json({ photos });
}

const createSchema = z.object({
  airport: z.string().min(1).max(20),
  mes: z.string(),
  objectPath: z.string().min(1),
  contentType: z.string().min(1).max(100),
  size: z.number().int().min(0),
  caption: z.string().max(200).optional().nullable(),
});

// Registrar la foto después de subirla a GCS (admin). Se agrega al final del orden actual.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  const airport = d.airport.trim().toUpperCase();
  if (!isValidMonth(d.mes)) return NextResponse.json({ error: "Mes inválido (YYYY-MM)." }, { status: 400 });
  if (!d.contentType.startsWith("image/")) {
    return NextResponse.json({ error: "Solo se admiten imágenes." }, { status: 400 });
  }

  const count = await prisma.reportPhoto.count({ where: { airport, mes: d.mes } });
  const photo = await prisma.reportPhoto.create({
    data: {
      airport,
      mes: d.mes,
      objectPath: d.objectPath,
      contentType: d.contentType,
      size: d.size,
      caption: d.caption?.trim() || null,
      order: count,
      uploadedById: user.id,
    },
  });
  return NextResponse.json({ id: photo.id, order: photo.order }, { status: 201 });
}
