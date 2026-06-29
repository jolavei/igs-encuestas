import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(2),
  kind: z.string().min(2),
});

export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const c = await prisma.company.create({ data: parsed.data });
  await audit(user.id, "company.create", "Company", c.id, parsed.data);
  return NextResponse.json({ id: c.id }, { status: 201 });
}
