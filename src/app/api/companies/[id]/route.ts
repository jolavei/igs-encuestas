import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const patchSchema = z.object({ active: z.boolean() });

// Activar / desactivar empresa (soft). Conserva todo el histórico.
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const company = await prisma.company.update({
    where: { id: params.id },
    data: { active: parsed.data.active },
  });
  await audit(
    user.id,
    parsed.data.active ? "company.activate" : "company.deactivate",
    "Company",
    company.id
  );
  return NextResponse.json({ id: company.id, active: company.active });
}

// Eliminar definitivamente. Solo si no tiene cuestionarios NI respuestas (protege histórico).
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const [questionnaires, responses] = await Promise.all([
    prisma.questionnaire.count({ where: { companies: { some: { id: params.id } } } }),
    prisma.responseSet.count({ where: { location: { companyId: params.id } } }),
  ]);

  if (questionnaires > 0 || responses > 0) {
    return NextResponse.json(
      {
        error:
          "No se puede eliminar: la empresa tiene cuestionarios o respuestas. Desactívala para conservar el histórico.",
      },
      { status: 409 }
    );
  }

  // Sin datos: borrar la empresa y sus sedes vacías.
  await prisma.company.delete({ where: { id: params.id } });
  await audit(user.id, "company.delete", "Company", params.id);
  return NextResponse.json({ ok: true });
}
