import { prisma } from "@/lib/prisma";

export type SegmentNode = {
  value: string;
  label: string;
  target: number;
  done: number;
};

export type Level1Node = SegmentNode & { children: SegmentNode[] };

export type PlanProgress = {
  total: number; // meta N
  done: number; // total realizado
  levels: Level1Node[]; // segmentos nivel 1 (con hijos nivel 2)
  otros: number; // realizadas fuera de los segmentos nivel 1 definidos
};

type PlanSegment = { parentValue: string | null; value: string; label: string; target: number };
type PlanWithSegments = { totalTarget: number; segments: PlanSegment[] };

/** Cuenta los levantamientos del plan y los agrupa por segmento (2 niveles). */
export async function getPlanProgress(
  planId: string,
  plan: PlanWithSegments
): Promise<PlanProgress> {
  const responses = await prisma.responseSet.findMany({
    where: { workPlanId: planId },
    select: { segmentValue: true, segmentValue2: true },
  });
  const done = responses.length;

  // Conteos nivel 1 (por segmentValue) y nivel 2 (por segmentValue|segmentValue2).
  const l1 = new Map<string, number>();
  const l2 = new Map<string, number>();
  for (const r of responses) {
    if (r.segmentValue) {
      l1.set(r.segmentValue, (l1.get(r.segmentValue) ?? 0) + 1);
      if (r.segmentValue2) {
        const k = `${r.segmentValue}|${r.segmentValue2}`;
        l2.set(k, (l2.get(k) ?? 0) + 1);
      }
    }
  }

  const level1 = plan.segments.filter((s) => !s.parentValue);
  const levels: Level1Node[] = level1.map((s) => ({
    value: s.value,
    label: s.label,
    target: s.target,
    done: l1.get(s.value) ?? 0,
    children: plan.segments
      .filter((c) => c.parentValue === s.value)
      .map((c) => ({
        value: c.value,
        label: c.label,
        target: c.target,
        done: l2.get(`${s.value}|${c.value}`) ?? 0,
      })),
  }));

  const targeted = new Set(level1.map((s) => s.value));
  const otros = responses.filter(
    (r) => !r.segmentValue || !targeted.has(r.segmentValue)
  ).length;

  return { total: plan.totalTarget, done, levels, otros };
}
