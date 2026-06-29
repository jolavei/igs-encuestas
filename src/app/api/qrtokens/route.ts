import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

const schema = z.object({
  questionnaireId: z.string(),
  locationId: z.string(),
});

// Token QR estable por cuestionario+sede. Resuelve version ACTIVE en runtime.
export async function POST(req: Request) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });

  const token = randomBytes(12).toString("base64url");
  const qr = await prisma.qrToken.create({
    data: { token, ...parsed.data },
  });
  await audit(user.id, "qrtoken.create", "QrToken", qr.id, parsed.data);
  return NextResponse.json({ id: qr.id, token }, { status: 201 });
}
