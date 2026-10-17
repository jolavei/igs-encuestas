import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { isValidMonth } from "@/lib/reports/monthlyReport";
import { SURVEY_VIEW_KEYS } from "@/lib/surveys/views";

export const runtime = "nodejs";

const schema = z.object({
  view: z.enum(SURVEY_VIEW_KEYS as [string, ...string[]]),
  scope: z.string().min(1).max(64), // id del plan o "all"
  mes: z.string().refine(isValidMonth),
  text: z.string().max(3000),
});

// Guardar (o borrar, si viene vacía) la apreciación general de las respuestas abiertas
// de un cuestionario para un plan y mes. Se muestra en el informe mensual.
export async function PUT(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });

  const { view, scope, mes } = parsed.data;
  const text = parsed.data.text.trim();
  const key = { view_scope_mes: { view, scope, mes } };
  if (!text) {
    await prisma.surveyAppraisal.deleteMany({ where: { view, scope, mes } });
    return NextResponse.json({ appraisal: null });
  }
  const row = await prisma.surveyAppraisal.upsert({
    where: key,
    update: { text, updatedById: user.id },
    create: { view, scope, mes, text, updatedById: user.id },
    select: { text: true, updatedAt: true },
  });
  return NextResponse.json({ appraisal: { text: row.text, updatedAt: row.updatedAt.toISOString() } });
}
