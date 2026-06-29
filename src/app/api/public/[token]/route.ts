import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createResponseSet } from "@/lib/responses";
import { submitSchema, type QuestionConfig } from "@/lib/questionTypes";
import { fromJson } from "@/lib/enums";

// Resuelve token QR -> version ACTIVE en runtime (QR impreso no caduca al versionar).
async function resolve(token: string) {
  const qr = await prisma.qrToken.findUnique({
    where: { token },
    include: { questionnaire: true, location: true },
  });
  if (!qr || !qr.active) return null;
  const version = await prisma.questionnaireVersion.findFirst({
    where: { questionnaireId: qr.questionnaireId, status: "ACTIVE" },
    orderBy: { versionNumber: "desc" },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!version) return null;
  return { qr, version };
}

export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  const r = await resolve(params.token);
  if (!r) return NextResponse.json({ error: "QR no válido o sin versión activa." }, { status: 404 });
  return NextResponse.json({
    title: r.qr.questionnaire.title,
    location: r.qr.location.name,
    versionId: r.version.id,
    questions: r.version.questions.map((q) => ({
      id: q.id,
      order: q.order,
      type: q.type,
      text: q.text,
      required: q.required,
      config: fromJson<QuestionConfig>(q.config),
    })),
  });
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  const r = await resolve(params.token);
  if (!r) return NextResponse.json({ error: "QR no válido." }, { status: 404 });

  const parsed = submitSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const result = await createResponseSet({
    versionId: r.version.id,
    source: "QR_PUBLIC",
    locationId: r.qr.locationId,
    raw: parsed.data.answers,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
