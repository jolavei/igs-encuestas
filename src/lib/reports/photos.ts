// Fotografías adjuntas a un informe mensual (por aeropuerto + mes). El binario vive
// en GCS; esta capa solo lee/escribe los metadatos en Postgres.
//
// Server-only. Lo consumen las rutas /api/reports/photos/* y el generador de PPTX.

import { prisma } from "@/lib/prisma";

export type ReportPhotoRow = {
  id: string;
  caption: string | null;
  order: number;
  objectPath: string;
  contentType: string;
};

/** Fotos de un informe (aeropuerto + mes), en el orden de aparición en la diapositiva. */
export async function listReportPhotos(airport: string, mes: string): Promise<ReportPhotoRow[]> {
  return prisma.reportPhoto.findMany({
    where: { airport, mes },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, caption: true, order: true, objectPath: true, contentType: true },
  });
}
