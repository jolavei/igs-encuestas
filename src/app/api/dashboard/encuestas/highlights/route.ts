import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";

export const runtime = "nodejs";

const schema = z.object({ answerId: z.string().min(1).max(64) });

// Destacar (★) una respuesta abierta para la diapositiva "Voz del pasajero" del informe.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });

  const answer = await prisma.answer.findUnique({
    where: { id: parsed.data.answerId },
    select: { id: true, question: { select: { type: true } } },
  });
  if (!answer || answer.question.type !== "TEXT") {
    return NextResponse.json({ error: "Solo se pueden destacar respuestas abiertas." }, { status: 400 });
  }
  await prisma.surveyHighlight.upsert({
    where: { answerId: answer.id },
    update: {},
    create: { answerId: answer.id, createdById: user.id },
  });
  return NextResponse.json({ ok: true });
}

// Quitar la marca de destacada.
export async function DELETE(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  await prisma.surveyHighlight.deleteMany({ where: { answerId: parsed.data.answerId } });
  return NextResponse.json({ ok: true });
}
