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
    "TEXT",
    "PARAGRAPH",
    "SINGLE_CHOICE",
    "MULTI_CHOICE",
    "DROPDOWN",
    "FILE_UPLOAD",
    "RATING",
    "DATETIME",
    // legado (para recargar versiones históricas)
    "NPS",
    "LIKERT",
    "NUMBER",
  ]),
  text: z.string().min(1),
  required: z.boolean().default(false),
  config: z.any().optional(),
  bqColumnName: z.string().optional().nullable(),
  bqType: z.enum(BQ_TYPES).optional().nullable(),
  bqDescription: z.string().optional().nullable(),
});

const sectionSchema = z.object({
  order: z.number().int(),
  title: z.string().default(""),
  description: z.string().optional().nullable(),
  routing: z.string().default("NEXT"), // "NEXT" | "SUBMIT" | "GOTO:<order>"
  questions: z.array(questionSchema).default([]),
});

const schema = z.object({
  sections: z.array(sectionSchema).min(1),
  publish: z.boolean().default(false),
  note: z.string().optional().nullable(),
});

// Crea una NUEVA version (snapshot inmutable). Editar = nueva version, nunca mutar.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const flat = parsed.data.sections.flatMap((s) => s.questions);
  if (flat.length === 0) {
    return NextResponse.json({ error: "Agrega al menos una pregunta." }, { status: 400 });
  }

  // Clave de referencia = nombre de columna saneado (o el texto). Única por versión.
  const keyed = flat.map((q) => ({
    q,
    key: q.bqColumnName ? sanitizeName(q.bqColumnName) : sanitizeName(q.text),
  }));
  const keys = keyed.map((k) => k.key).filter(Boolean);
  const dup = keys.find((k, i) => keys.indexOf(k) !== i);
  if (dup) {
    return NextResponse.json(
      { error: `Hay nombres de columna repetidos ("${dup}"). Cada pregunta debe tener un nombre único.` },
      { status: 400 }
    );
  }
  const keyOf = (q: (typeof flat)[number]) => keyed.find((k) => k.q === q)?.key || null;

  const last = await prisma.questionnaireVersion.findFirst({
    where: { questionnaireId: params.id },
    orderBy: { versionNumber: "desc" },
  });
  const nextNumber = (last?.versionNumber ?? 0) + 1;
  const publish = parsed.data.publish;

  const version = await prisma.$transaction(async (tx) => {
    const v = await tx.questionnaireVersion.create({
      data: {
        questionnaireId: params.id,
        versionNumber: nextNumber,
        status: publish ? "ACTIVE" : "DRAFT",
        publishedAt: publish ? new Date() : null,
        createdById: user.id,
        note: parsed.data.note ?? null,
      },
    });

    for (const s of parsed.data.sections) {
      const sec = await tx.questionSection.create({
        data: {
          versionId: v.id,
          order: s.order,
          title: s.title,
          description: s.description ?? null,
          routing: s.routing,
        },
      });
      if (s.questions.length) {
        await tx.question.createMany({
          data: s.questions.map((q) => ({
            versionId: v.id,
            sectionId: sec.id,
            order: q.order,
            type: q.type,
            text: q.text,
            required: q.required,
            config: toJson(q.config),
            equivalenceKey: keyOf(q),
            bqColumnName: q.bqColumnName ? sanitizeName(q.bqColumnName) : null,
            bqType: q.bqType ?? null,
            bqDescription: q.bqDescription ?? null,
          })),
        });
      }
    }

    if (publish) {
      await tx.questionnaireVersion.updateMany({
        where: { questionnaireId: params.id, status: "ACTIVE", id: { not: v.id } },
        data: { status: "ARCHIVED" },
      });
    }
    return v;
  });

  await audit(user.id, publish ? "version.publish" : "version.create", "QuestionnaireVersion", version.id, {
    versionNumber: nextNumber,
    questions: flat.length,
    sections: parsed.data.sections.length,
  });

  return NextResponse.json({ id: version.id, versionNumber: nextNumber }, { status: 201 });
}
