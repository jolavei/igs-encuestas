import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { chileDayToUtc } from "@/lib/dates";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "SURVEYOR", "CLIENT"]),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  rut: z.string().nullable().optional(),
  birthDate: z.string().nullable().optional(),
  emergencyName: z.string().nullable().optional(),
  emergencyPhone: z.string().nullable().optional(),
  locationIds: z.array(z.string()).optional(),
});

// Pre-registrar un usuario por correo. Cuando inicie sesión mantiene rol, datos y
// sedes; el rol se resuelve server-side desde la DB.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  const email = d.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Ya existe un usuario con ese correo." }, { status: 409 });
  }

  const locationIds = d.locationIds ?? [];
  // Empresa/sede "principal" (compatibilidad) = 1ª sede seleccionada.
  const primary = locationIds.length
    ? await prisma.location.findUnique({
        where: { id: locationIds[0] },
        select: { id: true, companyId: true },
      })
    : null;

  const fullName = [d.firstName, d.lastName].filter(Boolean).join(" ").trim();

  const created = await prisma.user.create({
    data: {
      email,
      role: d.role,
      firstName: d.firstName ?? null,
      lastName: d.lastName ?? null,
      name: fullName || email.split("@")[0],
      phone: d.phone ?? null,
      address: d.address ?? null,
      rut: d.rut ?? null,
      birthDate: d.birthDate ? chileDayToUtc(d.birthDate) : null,
      emergencyName: d.emergencyName ?? null,
      emergencyPhone: d.emergencyPhone ?? null,
      ...(primary?.companyId ? { company: { connect: { id: primary.companyId } } } : {}),
      ...(primary?.id ? { location: { connect: { id: primary.id } } } : {}),
      ...(locationIds.length
        ? { assignedLocations: { connect: locationIds.map((id) => ({ id })) } }
        : {}),
    },
  });
  await audit(user.id, "user.create", "User", created.id, { email, role: d.role });
  return NextResponse.json({ id: created.id }, { status: 201 });
}
