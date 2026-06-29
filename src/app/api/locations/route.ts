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
});

export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const l = await prisma.location.create({ data: parsed.data });
  await audit(user.id, "location.create", "Location", l.id, parsed.data);
  return NextResponse.json({ id: l.id }, { status: 201 });
}
