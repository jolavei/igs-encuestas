import { prisma } from "@/lib/prisma";

export type SegmentProgress = {
  value: string;
  label: string;
  target: number;
  done: number;
};

export type PlanProgress = {
  total: number; // meta N
  done: number; // total realizado
  segments: SegmentProgress[];
  otros: number; // realizadas fuera de los segmentos definidos
};

type PlanWithSegments = {
  totalTarget: number;
  segments: { value: string; label: string; target: number }[];
};

/** Cuenta los levantamientos ligados al plan y los agrupa por segmento. */
export async function getPlanProgress(
  planId: string,
  plan: PlanWithSegments
): Promise<PlanProgress> {
  const responses = await prisma.responseSet.findMany({
    where: { workPlanId: planId },
    select: { segmentValue: true },
  });

  const done = responses.length;
  const counts = new Map<string, number>();
  for (const r of responses) {
    const k = r.segmentValue ?? "__none";
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const targeted = new Set(plan.segments.map((s) => s.value));
  const segments = plan.segments.map((s) => ({
    value: s.value,
    label: s.label,
    target: s.target,
    done: counts.get(s.value) ?? 0,
  }));
  const otros = responses.filter(
    (r) => !r.segmentValue || !targeted.has(r.segmentValue)
  ).length;

  return { total: plan.totalTarget, done, segments, otros };
}
