import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { chileDayToUtc } from "@/lib/dates";

// Dos operaciones sobre un plan según el cuerpo recibido:
//  - Cambio de estado (cancelar / reactivar): cuerpo = solo { status }.
//  - Edición completa: cuerpo con todos los campos del plan (misma forma que POST).
// status: ACTIVE | COMPLETED | CANCELLED. "Cancelar" un plan = CANCELLED: lo oculta
// a los encuestadores y del avance de planes vigentes, pero conserva su histórico.
const statusSchema = z
  .object({ status: z.enum(["ACTIVE", "COMPLETED", "CANCELLED"]) })
  .strict();

const editSchema = z.object({
  companyId: z.string(),
  questionnaireId: z.string(),
  locationId: z.string().optional().nullable(),
  windowStart: z.string(),
  windowEnd: z.string(),
  totalTarget: z.number().int().min(0),
  segmentKey: z.string().optional().nullable(),
  segmentLabel: z.string().optional().nullable(),
  segment2Key: z.string().optional().nullable(),
  segment2Label: z.string().optional().nullable(),
  segments: z
    .array(
      z.object({
        parentValue: z.string().optional().nullable(),
        value: z.string().min(1),
        label: z.string().min(1),
        target: z.number().int().min(0),
      })
    )
    .max(500)
    .default([]),
  surveyorIds: z.array(z.string()).default([]),
  comment: z.string().optional().nullable(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const body = await req.json();

  // Cambio de estado (cancelar / reactivar): cuerpo con solo { status }.
  const st = statusSchema.safeParse(body);
  if (st.success) {
    const plan = await prisma.workPlan.update({
      where: { id: params.id },
      data: { status: st.data.status },
    });
    await audit(user.id, "workplan.status", "WorkPlan", plan.id, { status: st.data.status });
    return NextResponse.json({ id: plan.id, status: plan.status });
  }

  // Edición completa del plan.
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  const start = chileDayToUtc(d.windowStart, "start");
  const end = chileDayToUtc(d.windowEnd, "end");
  if (!start || !end || end < start) {
    return NextResponse.json({ error: "Ventana de fechas inválida." }, { status: 400 });
  }

  // Las sub-metas se reemplazan por completo (se borran y recrean).
  await prisma.$transaction([
    prisma.workPlanSegment.deleteMany({ where: { workPlanId: params.id } }),
    prisma.workPlan.update({
      where: { id: params.id },
      data: {
        companyId: d.companyId,
        questionnaireId: d.questionnaireId,
        locationId: d.locationId || null,
        windowStart: start,
        windowEnd: end,
        totalTarget: d.totalTarget,
        segmentKey: d.segmentKey || null,
        segmentLabel: d.segmentLabel || null,
        segment2Key: d.segment2Key || null,
        segment2Label: d.segment2Label || null,
        comment: d.comment || null,
        segments: {
          create: d.segments.map((s) => ({
            parentValue: s.parentValue || null,
            value: s.value,
            label: s.label,
            target: s.target,
          })),
        },
        surveyors: { set: d.surveyorIds.map((id) => ({ id })) },
      },
    }),
  ]);

  await audit(user.id, "workplan.update", "WorkPlan", params.id, {
    totalTarget: d.totalTarget,
    segments: d.segments.length,
  });
  return NextResponse.json({ id: params.id });
}
