import { NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { chileDayToUtc } from "@/lib/dates";

const schema = z.object({
  role: z.enum(["ADMIN", "SURVEYOR", "CLIENT"]).optional(),
  active: z.boolean().optional(),
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  const d = parsed.data;

  // No permitir auto-desactivarse (evita quedar fuera del sistema).
  if (d.active === false && params.id === user.id) {
    return NextResponse.json(
      { error: "No puedes desactivar tu propia cuenta." },
      { status: 400 }
    );
  }

  // Proteger el último administrador: no dejar que se degrade de rol o se desactive
  // al único ADMIN activo que queda (incluye la auto-degradación de rol).
  const demoting = d.role !== undefined && d.role !== "ADMIN";
  const deactivating = d.active === false;
  if (demoting || deactivating) {
    const target = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true, active: true },
    });
    if (target?.role === "ADMIN" && target.active) {
      const otherAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, id: { not: params.id } },
      });
      if (otherAdmins === 0) {
        return NextResponse.json(
          { error: "No puedes dejar el sistema sin administradores activos." },
          { status: 400 }
        );
      }
    }
  }

  const data: Prisma.UserUpdateInput = {};
  if (d.role !== undefined) data.role = d.role;
  if (d.active !== undefined) data.active = d.active;
  if (d.firstName !== undefined) data.firstName = d.firstName;
  if (d.lastName !== undefined) data.lastName = d.lastName;
  if (d.phone !== undefined) data.phone = d.phone;
  if (d.address !== undefined) data.address = d.address;
  if (d.rut !== undefined) data.rut = d.rut;
  if (d.birthDate !== undefined) data.birthDate = d.birthDate ? chileDayToUtc(d.birthDate) : null;
  if (d.emergencyName !== undefined) data.emergencyName = d.emergencyName;
  if (d.emergencyPhone !== undefined) data.emergencyPhone = d.emergencyPhone;

  // Recalcular el nombre mostrado si cambió Nombre o Apellidos.
  if (d.firstName !== undefined || d.lastName !== undefined) {
    const current = await prisma.user.findUnique({
      where: { id: params.id },
      select: { firstName: true, lastName: true, email: true },
    });
    const fn = d.firstName !== undefined ? d.firstName : current?.firstName;
    const ln = d.lastName !== undefined ? d.lastName : current?.lastName;
    const fullName = [fn, ln].filter(Boolean).join(" ").trim();
    data.name = fullName || current?.email?.split("@")[0] || null;
  }

  // Sedes asignadas (M2M). Se sincroniza la empresa/sede "principal" con la 1ª.
  if (d.locationIds !== undefined) {
    const locationIds = d.locationIds;
    data.assignedLocations = { set: locationIds.map((id) => ({ id })) };
    const primary = locationIds.length
      ? await prisma.location.findUnique({
          where: { id: locationIds[0] },
          select: { id: true, companyId: true },
        })
      : null;
    data.company = primary?.companyId
      ? { connect: { id: primary.companyId } }
      : { disconnect: true };
    data.location = primary?.id ? { connect: { id: primary.id } } : { disconnect: true };
  }

  const updated = await prisma.user.update({ where: { id: params.id }, data });
  await audit(user.id, "user.update", "User", updated.id, { fields: Object.keys(d) });
  return NextResponse.json({ id: updated.id });
}
