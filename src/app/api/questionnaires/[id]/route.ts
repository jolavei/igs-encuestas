import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const patchSchema = z
  .object({
    active: z.boolean().optional(),
    title: z.string().trim().min(2).optional(),
    // Encuesta bilingüe (botón ES | EN) y título en inglés.
    bilingual: z.boolean().optional(),
    titleEn: z.string().trim().max(300).nullable().optional(),
  })
  .refine(
    (d) =>
      d.active !== undefined ||
      d.title !== undefined ||
      d.bilingual !== undefined ||
      d.titleEn !== undefined,
    { message: "Nada que actualizar." }
  );

// Renombrar y/o dejar vigente / no vigente un cuestionario (soft). Conserva versiones e histórico.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { active, title, bilingual, titleEn } = parsed.data;

  const q = await prisma.questionnaire.update({
    where: { id: params.id },
    data: {
      ...(active !== undefined ? { active } : {}),
      ...(title !== undefined ? { title } : {}),
      ...(bilingual !== undefined ? { bilingual } : {}),
      ...(titleEn !== undefined ? { titleEn: titleEn || null } : {}),
    },
  });

  if (bilingual !== undefined || titleEn !== undefined) {
    await audit(user.id, "questionnaire.language", "Questionnaire", q.id, { bilingual, titleEn });
  }

  if (title !== undefined) {
    await audit(user.id, "questionnaire.rename", "Questionnaire", q.id, { title });
  }
  if (active !== undefined) {
    await audit(
      user.id,
      active ? "questionnaire.activate" : "questionnaire.deactivate",
      "Questionnaire",
      q.id
    );
  }

  return NextResponse.json({
    id: q.id,
    active: q.active,
    title: q.title,
    bilingual: q.bilingual,
    titleEn: q.titleEn,
  });
}
