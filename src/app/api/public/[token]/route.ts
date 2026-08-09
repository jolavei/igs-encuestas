import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { createResponseSet } from "@/lib/responses";
import { submitSchema, type QuestionConfig } from "@/lib/questionTypes";
import { fromJson } from "@/lib/enums";
import { enforceRateLimit } from "@/lib/rateLimit";
import { onceCookieName, onceCookieOptions } from "@/lib/onceGuard";

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
  req: Request,
  { params }: { params: { token: string } }
) {
  const limited = enforceRateLimit(req, "public-get", 40, 60_000); // 40/min por IP
  if (limited) return limited;

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
  const limited = enforceRateLimit(req, "public-post", 8, 60_000); // 8 envíos/min por IP
  if (limited) return limited;

  const r = await resolve(params.token);
  if (!r) return NextResponse.json({ error: "QR no válido." }, { status: 404 });

  // Una respuesta por dispositivo cada 24 h: si ya respondió desde este navegador,
  // se acepta en silencio sin crear un duplicado. Ver lib/onceGuard.
  const cookieName = onceCookieName(params.token);
  if (cookies().get(cookieName)) {
    return NextResponse.json({ ok: true, duplicate: true }, { status: 200 });
  }

  const parsed = submitSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const result = await createResponseSet({
    versionId: r.version.id,
    source: "QR_PUBLIC",
    locationId: r.qr.locationId,
    raw: parsed.data.answers,
    presentedQuestionIds: parsed.data.presentedQuestionIds,
    clientSubmissionId: parsed.data.clientSubmissionId,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });

  const res = NextResponse.json({ id: result.id }, { status: 201 });
  res.cookies.set(cookieName, "1", onceCookieOptions());
  return res;
}
