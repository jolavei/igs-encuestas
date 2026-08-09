// Validaciones de integridad referencial para operaciones de escritura (admin).
// Prisma ya rechaza IDs inexistentes en relaciones, pero NO valida la COHERENCIA
// entre entidades (p. ej. que una sede pertenezca a la empresa elegida, o que una
// carpeta destino sea de la misma empresa/sede). Estas funciones cierran ese hueco
// y devuelven un mensaje de error legible, o null si todo cuadra.
import { prisma } from "@/lib/prisma";

/**
 * Coherencia de un plan de trabajo (crear/editar).
 *
 * OJO: por diseño NO se exige que el cuestionario esté "asignado" a la empresa. El
 * formulario ofrece cualquier cuestionario con versión activa y la asociación
 * empresa↔cuestionario nace del propio plan (ver NewWorkPlanForm). Tampoco se valida
 * el rol/estado de los encuestadores: Prisma ya rechaza IDs inexistentes y exigir
 * rol/activo rompería la edición de planes antiguos con un encuestador ya desactivado.
 */
export async function validatePlanRefs(d: {
  companyId: string;
  questionnaireId: string;
  locationId?: string | null;
}): Promise<string | null> {
  const [company, questionnaire] = await Promise.all([
    prisma.company.findUnique({
      where: { id: d.companyId },
      select: { id: true, locations: { select: { id: true } } },
    }),
    prisma.questionnaire.findUnique({
      where: { id: d.questionnaireId },
      select: { id: true },
    }),
  ]);
  if (!company) return "La empresa indicada no existe.";
  if (!questionnaire) return "El cuestionario indicado no existe.";
  if (d.locationId && !company.locations.some((l) => l.id === d.locationId)) {
    return "La sede seleccionada no pertenece a esta empresa.";
  }
  return null;
}

/**
 * Coherencia del destino de un documento o carpeta: empresa existe, la sede (si se
 * indica) pertenece a la empresa, y la carpeta destino (si se indica) es de la misma
 * empresa y sede. Para crear una carpeta, pasar `folderId` = carpeta padre.
 */
export async function validateDocTarget(d: {
  companyId: string;
  locationId?: string | null;
  folderId?: string | null;
}): Promise<string | null> {
  const locationId = d.locationId ?? null;
  const company = await prisma.company.findUnique({
    where: { id: d.companyId },
    select: { id: true, locations: { select: { id: true } } },
  });
  if (!company) return "La empresa indicada no existe.";
  if (locationId && !company.locations.some((l) => l.id === locationId)) {
    return "La sede indicada no pertenece a esta empresa.";
  }
  if (d.folderId) {
    const folder = await prisma.folder.findUnique({
      where: { id: d.folderId },
      select: { companyId: true, locationId: true },
    });
    if (!folder) return "La carpeta indicada no existe.";
    if (folder.companyId !== d.companyId) return "La carpeta pertenece a otra empresa.";
    if ((folder.locationId ?? null) !== locationId) {
      return "La carpeta no corresponde a esta sede.";
    }
  }
  return null;
}
