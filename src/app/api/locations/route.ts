import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  companyId: z.string(),
  name: z.string().min(2),
  city: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  iataCode: z.string().optional().nullable(),
  icaoCode: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const d = parsed.data;
  const l = await prisma.location.create({
    data: {
      companyId: d.companyId,
      name: d.name,
      city: d.city?.trim() || null,
      address: d.address?.trim() || null,
      // Los códigos de aeropuerto se guardan en mayúsculas por convención.
      iataCode: d.iataCode?.trim().toUpperCase() || null,
      icaoCode: d.icaoCode?.trim().toUpperCase() || null,
      timezone: d.timezone?.trim() || null,
    },
  });
  await audit(user.id, "location.create", "Location", l.id, d);
  return NextResponse.json({ id: l.id }, { status: 201 });
}
