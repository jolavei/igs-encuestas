import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { planDictionaryTranslations, planTranslations } from "@/lib/surveyI18n";

const optionSchema = z.object({
  value: z.string().max(500),
  labelEn: z.string().max(500).nullable().optional(),
});
const questionSchema = z.object({
  order: z.number().int(),
  text: z.string().max(2000),
  textEn: z.string().max(2000).nullable().optional(),
  options: z.array(optionSchema).max(200).optional(),
});
const sectionSchema = z.object({
  order: z.number().int(),
  title: z.string().max(500).default(""),
  titleEn: z.string().max(500).nullable().optional(),
  descriptionEn: z.string().max(2000).nullable().optional(),
  questions: z.array(questionSchema).max(300).default([]),
});
const schema = z.object({
  // Versión a traducir; por defecto, la última (la que carga el constructor).
  // target "active" = la versión ACTIVE (la que responden los encuestados).
  versionId: z.string().max(60).optional(),
  target: z.enum(["latest", "active"]).default("latest"),
  // Por orden (constructor): secciones/preguntas con su texto en español para verificar.
  sections: z.array(sectionSchema).max(200).optional(),
  // Por diccionario (carga de una traducción aprobada): texto en español -> inglés.
  dictionary: z.record(z.string().max(2000), z.string().max(2000)).optional(),
  // strict (constructor): si algo no calza, no se guarda nada. false (carga masiva
  // por script): se guarda lo que calza y se informa lo demás.
  strict: z.boolean().default(true),
});

// Guarda SOLO las traducciones al inglés en una versión existente, sin crear una
// versión nueva: no cambian lo que se guarda en las respuestas (los values siguen en
// español). Si el texto en español no coincide, es un cambio de contenido y se rechaza.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const { versionId, target, sections, dictionary } = parsed.data;
  if (!sections && !dictionary) {
    return NextResponse.json({ error: "Faltan las traducciones." }, { status: 400 });
  }
  const version = await prisma.questionnaireVersion.findFirst({
    where: versionId
      ? { id: versionId, questionnaireId: params.id }
      : target === "active"
      ? { questionnaireId: params.id, status: "ACTIVE" }
      : { questionnaireId: params.id },
    orderBy: { versionNumber: "desc" },
    include: { questions: true, sections: true },
  });
  if (!version) {
    return NextResponse.json(
      { error: target === "active" ? "El cuestionario no tiene versión activa." : "Versión no encontrada." },
      { status: 404 }
    );
  }

  const plan = dictionary
    ? planDictionaryTranslations(
        version.questions,
        version.sections,
        new Map(version.questions.map((q) => [q.id, q.textEn])),
        dictionary
      )
    : planTranslations(version.questions, version.sections, sections!);
  const untranslated = "untranslated" in plan ? plan.untranslated : [];
  if (parsed.data.strict && plan.mismatches.length) {
    return NextResponse.json(
      {
        error:
          "Hay cambios en el contenido en español. Para eso publica o guarda una versión nueva; «Guardar solo inglés» solo cambia las traducciones.",
        mismatches: plan.mismatches,
      },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    ...plan.sections.map((s) =>
      prisma.questionSection.update({
        where: { id: s.id },
        data: { titleEn: s.titleEn, descriptionEn: s.descriptionEn },
      })
    ),
    ...plan.questions.map((q) =>
      prisma.question.update({ where: { id: q.id }, data: { textEn: q.textEn, config: q.config } })
    ),
  ]);

  await audit(user.id, "version.translate", "QuestionnaireVersion", version.id, {
    versionNumber: version.versionNumber,
    questions: plan.questions.length,
    sections: plan.sections.length,
    mismatches: plan.mismatches.length,
  });

  return NextResponse.json({
    versionNumber: version.versionNumber,
    status: version.status,
    untranslated,
    questions: plan.questions.length,
    sections: plan.sections.length,
    mismatches: plan.mismatches,
  });
}
