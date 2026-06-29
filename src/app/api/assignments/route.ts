import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  surveyorId: z.string(),
  questionnaireId: z.string(),
  locationId: z.string().optional().nullable(),
  quota: z.number().int().min(0).default(0),
  workPlanComment: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const a = await prisma.assignment.create({
    data: { ...parsed.data, createdById: user.id },
  });
  await audit(user.id, "assignment.create", "Assignment", a.id, parsed.data);
  return NextResponse.json({ id: a.id }, { status: 201 });
}
