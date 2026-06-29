import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import {
  generateSourcesFile,
  generateTableSqlx,
  type GenQuestion,
} from "@/lib/dataform";
import type { QuestionType } from "@/lib/questionTypes";

// Genera la definición Dataform (tabla ancha en BigQuery) de un cuestionario,
// a partir de su versión ACTIVE (o la última si no hay activa).
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const q = await prisma.questionnaire.findUnique({
    where: { id: params.id },
    include: {
      companies: { select: { name: true } },
      versions: {
        orderBy: { versionNumber: "desc" },
        include: { questions: { orderBy: { order: "asc" } } },
      },
    },
  });
  if (!q) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const version = q.versions.find((v) => v.status === "ACTIVE") ?? q.versions[0];
  if (!version) {
    return NextResponse.json({ error: "El cuestionario no tiene versiones." }, { status: 400 });
  }

  const questions: GenQuestion[] = version.questions.map((qq) => ({
    type: qq.type as QuestionType,
    text: qq.text,
    equivalenceKey: qq.equivalenceKey,
    bqColumnName: qq.bqColumnName,
    bqType: qq.bqType,
    bqDescription: qq.bqDescription,
  }));

  const table = generateTableSqlx({
    questionnaireId: q.id,
    questionnaireTitle: q.title,
    companyNames: q.companies.map((c) => c.name),
    questions,
  });

  return NextResponse.json({
    versionNumber: version.versionNumber,
    sources: { fileName: "definitions/sources.js", content: generateSourcesFile() },
    table,
    mappedColumns: questions.filter((x) => x.bqColumnName || x.equivalenceKey).length,
    totalQuestions: questions.length,
  });
}
