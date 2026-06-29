import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { createResponseSet } from "@/lib/responses";
import { submitSchema } from "@/lib/questionTypes";

const schema = submitSchema.extend({ assignmentId: z.string() });

// Levantamiento en campo (encuestador). Liga la respuesta a la asignacion + version activa.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["SURVEYOR", "ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const assignment = await prisma.assignment.findUnique({
    where: { id: parsed.data.assignmentId },
  });
  if (!assignment || assignment.surveyorId !== user.id) {
    return NextResponse.json({ error: "Asignación no válida." }, { status: 403 });
  }

  const version = await prisma.questionnaireVersion.findFirst({
    where: { questionnaireId: assignment.questionnaireId, status: "ACTIVE" },
    orderBy: { versionNumber: "desc" },
  });
  if (!version) return NextResponse.json({ error: "Sin versión activa." }, { status: 400 });

  const result = await createResponseSet({
    versionId: version.id,
    source: "FIELD",
    locationId: assignment.locationId,
    surveyorId: user.id,
    assignmentId: assignment.id,
    raw: parsed.data.answers,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
