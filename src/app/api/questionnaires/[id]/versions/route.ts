import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { toJson } from "@/lib/enums";
import { BQ_TYPES, sanitizeName } from "@/lib/dataform";

const questionSchema = z.object({
  order: z.number().int(),
  type: z.enum([
    "LIKERT",
    "NPS",
    "SINGLE_CHOICE",
    "MULTI_CHOICE",
    "TEXT",
    "DATETIME",
    "NUMBER",
  ]),
  text: z.string().min(1),
  required: z.boolean().default(false),
  config: z.any().optional(),
  equivalenceKey: z.string().optional().nullable(),
  bqColumnName: z.string().optional().nullable(),
  bqType: z.enum(BQ_TYPES).optional().nullable(),
  bqDescription: z.string().optional().nullable(),
});

const schema = z.object({
  questions: z.array(questionSchema).min(1),
  publish: z.boolean().default(false),
  note: z.string().optional().nullable(),
});

// Crea una NUEVA version (snapshot inmutable). Editar = nueva version, nunca mutar.
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const last = await prisma.questionnaireVersion.findFirst({
    where: { questionnaireId: params.id },
    orderBy: { versionNumber: "desc" },
  });
  const nextNumber = (last?.versionNumber ?? 0) + 1;

  const version = await prisma.$transaction(async (tx) => {
    const v = await tx.questionnaireVersion.create({
      data: {
        questionnaireId: params.id,
        versionNumber: nextNumber,
        status: parsed.data.publish ? "ACTIVE" : "DRAFT",
        publishedAt: parsed.data.publish ? new Date() : null,
        createdById: user.id,
        note: parsed.data.note ?? null,
        questions: {
          create: parsed.data.questions.map((q) => {
            // Si hay columna BQ pero no equivalenceKey, derivarla del nombre de columna:
            // garantiza que el pivote de Dataform tenga clave estable entre versiones.
            const equivalenceKey =
              q.equivalenceKey ||
              (q.bqColumnName ? sanitizeName(q.bqColumnName) : null);
            return {
              order: q.order,
              type: q.type,
              text: q.text,
              required: q.required,
              config: toJson(q.config),
              equivalenceKey,
              bqColumnName: q.bqColumnName ? sanitizeName(q.bqColumnName) : null,
              bqType: q.bqType ?? null,
              bqDescription: q.bqDescription ?? null,
            };
          }),
        },
      },
    });

    if (parsed.data.publish) {
      // Solo una version ACTIVE por cuestionario.
      await tx.questionnaireVersion.updateMany({
        where: { questionnaireId: params.id, status: "ACTIVE", id: { not: v.id } },
        data: { status: "ARCHIVED" },
      });
    }
    return v;
  });

  await audit(
    user.id,
    parsed.data.publish ? "version.publish" : "version.create",
    "QuestionnaireVersion",
    version.id,
    { versionNumber: nextNumber, questions: parsed.data.questions.length }
  );

  return NextResponse.json({ id: version.id, versionNumber: nextNumber }, { status: 201 });
}
