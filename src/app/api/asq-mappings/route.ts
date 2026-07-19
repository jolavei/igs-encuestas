import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  airport: z.string().min(1),
  companyId: z.string().nullable().optional(),
  locationId: z.string().nullable().optional(),
});

// Asocia (upsert) un aeropuerto ASQ a una empresa + sede.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { airport, companyId = null, locationId = null } = parsed.data;

  const mapping = await prisma.asqAirportMapping.upsert({
    where: { airport },
    create: { airport, companyId, locationId },
    update: { companyId, locationId },
  });
  await audit(user.id, "asqMapping.set", "AsqAirportMapping", airport, parsed.data);
  return NextResponse.json({ airport: mapping.airport });
}
