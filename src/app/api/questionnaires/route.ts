import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  title: z.string().min(2),
  companyIds: z.array(z.string()).default([]),
});

export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const q = await prisma.questionnaire.create({
    data: {
      title: parsed.data.title,
      companies: { connect: parsed.data.companyIds.map((id) => ({ id })) },
    },
  });
  await audit(user.id, "questionnaire.create", "Questionnaire", q.id, parsed.data);
  return NextResponse.json({ id: q.id }, { status: 201 });
}
