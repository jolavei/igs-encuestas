import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { createResponseSet } from "@/lib/responses";
import { submitSchema } from "@/lib/questionTypes";

const schema = submitSchema.extend({
  workPlanId: z.string(),
  locationId: z.string().optional().nullable(),
});

// Levantamiento en campo (encuestador o admin), ligado a un plan de trabajo.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["SURVEYOR", "ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Payload inválido." }, { status: 400 });

  const plan = await prisma.workPlan.findUnique({
    where: { id: parsed.data.workPlanId },
    include: { surveyors: { select: { id: true } }, company: { include: { locations: true } } },
  });
  if (!plan || plan.status !== "ACTIVE") {
    return NextResponse.json({ error: "Plan no válido o inactivo." }, { status: 400 });
  }

  // Encuestador: debe estar asignado. Admin: puede levantar en cualquier plan.
  if (user.role === "SURVEYOR" && !plan.surveyors.some((s) => s.id === user.id)) {
    return NextResponse.json({ error: "No estás asignado a este plan." }, { status: 403 });
  }

  // Sede: la del plan si la fija; si no, la que envía el usuario (debe ser de la empresa).
  const locationId = plan.locationId ?? parsed.data.locationId ?? null;
  if (!locationId) {
    return NextResponse.json({ error: "Falta indicar la sede." }, { status: 400 });
  }
  if (!plan.company.locations.some((l) => l.id === locationId)) {
    return NextResponse.json({ error: "Sede no pertenece a la empresa." }, { status: 400 });
  }

  const version = await prisma.questionnaireVersion.findFirst({
    where: { questionnaireId: plan.questionnaireId, status: "ACTIVE" },
    orderBy: { versionNumber: "desc" },
  });
  if (!version) return NextResponse.json({ error: "Cuestionario sin versión activa." }, { status: 400 });

  const result = await createResponseSet({
    versionId: version.id,
    source: "FIELD",
    locationId,
    surveyorId: user.id,
    workPlanId: plan.id,
    segmentKey: plan.segmentKey,
    segment2Key: plan.segment2Key,
    raw: parsed.data.answers,
  });
  if (!result.ok) return NextResponse.json(result, { status: result.status });
  return NextResponse.json({ id: result.id }, { status: 201 });
}
