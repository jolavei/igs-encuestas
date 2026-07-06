import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiUser } from "@/lib/rbac";
import { audit } from "@/lib/audit";

// Borrar carpeta (admin). Solo si está vacía (sin subcarpetas ni documentos).
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { user, status } = await apiUser(["ADMIN"]);
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status });

  const [children, docs] = await Promise.all([
    prisma.folder.count({ where: { parentId: params.id } }),
    prisma.document.count({ where: { folderId: params.id } }),
  ]);
  if (children > 0 || docs > 0) {
    return NextResponse.json(
      { error: "La carpeta no está vacía. Vacíala antes de borrarla." },
      { status: 409 }
    );
  }

  await prisma.folder.delete({ where: { id: params.id } });
  await audit(user.id, "folder.delete", "Folder", params.id);
  return NextResponse.json({ ok: true });
}
