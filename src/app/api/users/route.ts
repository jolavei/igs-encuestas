import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "SURVEYOR", "CLIENT"]),
  companyId: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

// Pre-registrar un usuario por correo. Cuando inicie sesión (Google/dev) mantiene
// este rol y empresa; el rol se resuelve server-side desde la DB.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese correo." }, { status: 409 });
  }

  const created = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name?.trim() || email.split("@")[0],
      role: parsed.data.role,
      companyId: parsed.data.companyId || null,
    },
  });
  await audit(user.id, "user.create", "User", created.id, {
    email,
    role: parsed.data.role,
  });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
