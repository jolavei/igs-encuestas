import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  city: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  iataCode: z.string().nullable().optional(),
  icaoCode: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});

// Editar una sede (nombre / ciudad / dirección / códigos de aeropuerto / zona horaria).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const d = parsed.data;
  const location = await prisma.location.update({
    where: { id: params.id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.city !== undefined ? { city: d.city?.trim() || null } : {}),
      ...(d.address !== undefined ? { address: d.address?.trim() || null } : {}),
      ...(d.iataCode !== undefined ? { iataCode: d.iataCode?.trim().toUpperCase() || null } : {}),
      ...(d.icaoCode !== undefined ? { icaoCode: d.icaoCode?.trim().toUpperCase() || null } : {}),
      ...(d.timezone !== undefined ? { timezone: d.timezone?.trim() || null } : {}),
    },
  });
  await audit(user.id, "location.update", "Location", location.id, d);
  return NextResponse.json({ id: location.id });
}

// Eliminar una sede. Solo si no tiene histórico (respuestas, planes, QR, documentos).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const [responses, workPlans, qrTokens, documents] = await Promise.all([
    prisma.responseSet.count({ where: { locationId: params.id } }),
    prisma.workPlan.count({ where: { locationId: params.id } }),
    prisma.qrToken.count({ where: { locationId: params.id } }),
    prisma.document.count({ where: { locationId: params.id, deletedAt: null } }),
  ]);

  if (responses > 0 || workPlans > 0 || qrTokens > 0 || documents > 0) {
    return NextResponse.json(
      {
        error:
          "No se puede eliminar: la sede tiene respuestas, planes, QR o documentos asociados.",
      },
      { status: 409 }
    );
  }

  await prisma.location.delete({ where: { id: params.id } });
  await audit(user.id, "location.delete", "Location", params.id);
  return NextResponse.json({ ok: true });
}
