import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const patchSchema = z.object({ active: z.boolean() });

// Dejar vigente / no vigente un cuestionario (soft). Conserva versiones e histórico.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const q = await prisma.questionnaire.update({
    where: { id: params.id },
    data: { active: parsed.data.active },
  });
  await audit(
    user.id,
    parsed.data.active ? "questionnaire.activate" : "questionnaire.deactivate",
    "Questionnaire",
    q.id
  );
  return NextResponse.json({ id: q.id, active: q.active });
}
