import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { chileDayToUtc } from "@/lib/dates";

const schema = z.object({
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

export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  // La ventana se define en días chilenos: desde las 00:00 del inicio hasta las
  // 23:59:59 del fin, para que el último día del plan siga vigente completo.
  const start = chileDayToUtc(d.windowStart, "start");
  const end = chileDayToUtc(d.windowEnd, "end");
  if (!start || !end || end < start) {
    return NextResponse.json({ error: "Ventana de fechas inválida." }, { status: 400 });
  }

  const plan = await prisma.workPlan.create({
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
      createdById: user.id,
      segments: {
        create: d.segments.map((s) => ({
          parentValue: s.parentValue || null,
          value: s.value,
          label: s.label,
          target: s.target,
        })),
      },
      surveyors: { connect: d.surveyorIds.map((id) => ({ id })) },
    },
  });

  await audit(user.id, "workplan.create", "WorkPlan", plan.id, {
    totalTarget: d.totalTarget,
    segments: d.segments.length,
  });
  return NextResponse.json({ id: plan.id }, { status: 201 });
}
