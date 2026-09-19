import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { getFlightScheduleProvider } from "@/lib/flights/provider";
import type { ScheduledFlight } from "@/lib/flights/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WINDOW_DAYS = 31;

const schema = z.object({
  origin: z.string().regex(/^[A-Za-z]{3}$/, "IATA de 3 letras"),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  airline: z.string().trim().max(40).optional(),
  flightNumber: z.string().trim().max(10).optional(),
});

function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000) + 1; // inclusivo
}

export async function GET(req: Request) {
  // Solo administradores (módulo de planificación interno).
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const url = new URL(req.url);
  const parsed = schema.safeParse({
    origin: url.searchParams.get("origin"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    airline: url.searchParams.get("airline") ?? undefined,
    flightNumber: url.searchParams.get("flightNumber") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos." }, { status: 400 });
  }
  const { origin, from, to, airline, flightNumber } = parsed.data;

  const span = daysBetween(from, to);
  if (span <= 0) return NextResponse.json({ error: "La fecha final debe ser posterior o igual a la inicial." }, { status: 400 });
  if (span > MAX_WINDOW_DAYS) {
    return NextResponse.json({ error: `La ventana no puede superar ${MAX_WINDOW_DAYS} días.` }, { status: 400 });
  }

  const provider = getFlightScheduleProvider();
  let flights: ScheduledFlight[];
  try {
    flights = await provider.getFlights({ origin: origin.toUpperCase(), from, to });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error consultando la fuente de itinerarios.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Filtrado común a todos los proveedores: aerolínea (código o nombre) y número de vuelo.
  const al = airline?.toLowerCase();
  const fn = flightNumber?.replace(/\s+/g, "").toLowerCase();
  const filtered = flights.filter((f) => {
    if (al && al !== "todas" && !(f.airlineCode.toLowerCase() === al || f.airlineName.toLowerCase().includes(al))) {
      return false;
    }
    if (fn && !f.flightNumber.toLowerCase().includes(fn)) return false;
    return true;
  });

  return NextResponse.json({
    provider: provider.name,
    origin: origin.toUpperCase(),
    from,
    to,
    count: filtered.length,
    flights: filtered,
    generatedAt: new Date().toISOString(),
  });
}
