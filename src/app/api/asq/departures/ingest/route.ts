import { NextResponse } from "next/server";
import { z } from "zod";
import { apiUser } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { gcsConfigured } from "@/lib/gcs";
import { BigQueryCredentialsError } from "@/lib/bigquery";
import { ingestObject } from "@/lib/asq/ingestService";

export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  objectPath: z.string().min(1).max(300),
  fileName: z.string().min(1).max(200).optional(),
});

// Carga REAL a BigQuery: parsea el archivo subido y hace ensure tabla → DELETE por
// temporada → load-append (idempotente). Registra el resultado en Postgres
// (AsqDepartureImport) para historial/auditoría. Admin-only.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });
  if (!gcsConfigured()) {
    return NextResponse.json({ error: "Almacenamiento no configurado." }, { status: 503 });
  }

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const { objectPath } = parsed.data;
  const displayName = parsed.data.fileName || objectPath.split("/").pop() || objectPath;

  try {
    const { report, result, fileName } = await ingestObject(objectPath, parsed.data.fileName);

    const record = await prisma.asqDepartureImport.create({
      data: {
        fileName,
        objectPath,
        status: "LOADED",
        quarters: result.quarters.join(",") || null,
        seasonLabel: Object.keys(report.seasons).join(", ") || null,
        rowCount: result.rowCount,
        ownRowCount: report.ownAirportRows,
        replacedRows: result.replacedRows,
        loadedRows: result.loadedRows,
        airportsJson: JSON.stringify(report.airports),
        bqTable: result.table,
        bqLoadJobId: result.loadJobId,
        ingestId: result.ingestId,
        createdById: user.id,
      },
    });
    await audit(user.id, "asqDepartures.ingest", "AsqDepartureImport", record.id, {
      quarters: result.quarters,
      rowCount: result.rowCount,
      replacedRows: result.replacedRows,
      loadedRows: result.loadedRows,
    });

    return NextResponse.json({ ok: true, import: record, result, report });
  } catch (e) {
    // Falta de credenciales de BQ = entorno no listo (no se registra como intento fallido).
    if (e instanceof BigQueryCredentialsError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    const message = e instanceof Error ? e.message : "No se pudo ingestar el archivo.";
    // Registrar el intento fallido (best-effort; no bloquear la respuesta).
    await prisma.asqDepartureImport
      .create({
        data: {
          fileName: displayName,
          objectPath,
          status: "FAILED",
          error: message.slice(0, 500),
          createdById: user.id,
        },
      })
      .catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
