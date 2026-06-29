import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  role: z.enum(["ADMIN", "SURVEYOR", "CLIENT"]).optional(),
  companyId: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  // No permitir auto-desactivarse (evita quedar fuera del sistema).
  if (parsed.data.active === false && params.id === user.id) {
    return NextResponse.json(
      { error: "No puedes desactivar tu propia cuenta." },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(parsed.data.role ? { role: parsed.data.role } : {}),
      ...(parsed.data.companyId !== undefined ? { companyId: parsed.data.companyId } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    },
  });
  await audit(user.id, "user.update", "User", updated.id, parsed.data);
  return NextResponse.json({ id: updated.id });
}
