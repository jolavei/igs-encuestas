import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  companyIds: z.array(z.string()),
});

// Reemplaza el conjunto de empresas a las que está asignado el cuestionario.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const q = await prisma.questionnaire.update({
    where: { id: params.id },
    data: { companies: { set: parsed.data.companyIds.map((id) => ({ id })) } },
    include: { companies: true },
  });
  await audit(user.id, "questionnaire.companies", "Questionnaire", q.id, parsed.data);
  return NextResponse.json({ id: q.id, companies: q.companies.map((c) => c.id) });
}
