import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2),
  kind: z.string().min(2),
  rut: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const d = parsed.data;
  const c = await prisma.company.create({
    data: {
      name: d.name,
      kind: d.kind,
      // Normaliza vacíos a null (los inputs mandan "" cuando quedan en blanco).
      rut: d.rut?.trim() || null,
      email: d.email?.trim() || null,
      phone: d.phone?.trim() || null,
    },
  });
  await audit(user.id, "company.create", "Company", c.id, d);
  return NextResponse.json({ id: c.id }, { status: 201 });
}
