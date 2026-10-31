import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { REPORT_KINDS, resolvePeriod } from "@/lib/reports/period";
import { MODULES, parseNotes, parseToggles } from "@/lib/reports/modules";
import { loadEdition } from "@/lib/reports/editions";

// Edición de un informe (aeropuerto + tipo + periodo): módulos encendidos/apagados,
// análisis por módulo, comentarios y estado (borrador / emitido). Solo ADMIN.

const MAX_TEXT = 3000;

const bodySchema = z.object({
  airport: z.string().min(1).max(20),
  kind: z.enum(REPORT_KINDS as [string, ...string[]]),
  periodKey: z.string().min(1).max(20),
  focusSeason: z.string().max(10).nullable().optional(),
  modules: z.record(z.boolean()).optional(),
  notes: z.record(z.string().max(MAX_TEXT)).optional(),
  comentarios: z.string().max(MAX_TEXT).optional(),
  status: z.enum(["BORRADOR", "EMITIDO"]).optional(),
});

export async function PUT(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;
  const kind = d.kind as (typeof REPORT_KINDS)[number];
  const airport = d.airport.trim().toUpperCase();

  const ctx = resolvePeriod(kind, d.periodKey, d.focusSeason);
  if (!ctx) return NextResponse.json({ error: "Periodo inválido." }, { status: 400 });

  const mapping = await prisma.asqAirportMapping.findUnique({ where: { airport } });
  if (!mapping?.companyId) return NextResponse.json({ error: "Aeropuerto sin empresa asociada." }, { status: 404 });

  // Solo módulos del catálogo que existan en este tipo; textos vacíos se descartan.
  const allowed = new Set(MODULES.filter((m) => m.supports.includes(kind)).map((m) => m.key as string));
  const toggles = Object.fromEntries(Object.entries(parseToggles(d.modules)).filter(([k]) => allowed.has(k)));
  const notes = Object.fromEntries(Object.entries(parseNotes(d.notes)).filter(([k]) => allowed.has(k)));

  const prev = await prisma.reportEdition.findUnique({
    where: { airport_kind_periodKey: { airport, kind, periodKey: ctx.key } },
    select: { status: true },
  });
  const nextStatus = d.status ?? prev?.status ?? "BORRADOR";
  const emission =
    nextStatus === "EMITIDO"
      ? prev?.status === "EMITIDO"
        ? {}
        : { emittedAt: new Date(), emittedById: user.id }
      : { emittedAt: null, emittedById: null };

  const data = {
    focusSeason: kind === "ANUAL" ? ctx.season.code : null,
    ...(d.modules ? { modules: toggles } : {}),
    ...(d.notes ? { notes } : {}),
    ...(d.comentarios !== undefined ? { comentarios: d.comentarios.trim() || null } : {}),
    status: nextStatus,
    ...emission,
    updatedById: user.id,
  };

  const row = await prisma.reportEdition.upsert({
    where: { airport_kind_periodKey: { airport, kind, periodKey: ctx.key } },
    create: { airport, kind, periodKey: ctx.key, ...data },
    update: data,
  });

  if ((prev?.status ?? "BORRADOR") !== nextStatus) {
    await audit(user.id, nextStatus === "EMITIDO" ? "report.emit" : "report.reopen", "ReportEdition", row.id, {
      airport,
      kind,
      periodKey: ctx.key,
    });
  }

  return NextResponse.json({ edition: await loadEdition(airport, kind, ctx.key) });
}
