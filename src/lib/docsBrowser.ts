import { prisma } from "@/lib/prisma";

export type Crumb = { id: string | null; name: string };

// Devuelve el contenido de una carpeta (o de la raíz) dentro de un contexto
// empresa + sede (locationId null = "General"), con la ruta (breadcrumb).
export async function getFolderView(
  companyId: string,
  locationId: string | null,
  folderId: string | null
) {
  // Breadcrumb: subir desde la carpeta actual hasta la raíz.
  const crumbs: Crumb[] = [];
  let cursor = folderId;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor)) {
    guard.add(cursor);
    const f = await prisma.folder.findUnique({
      where: { id: cursor },
      select: { id: true, name: true, parentId: true },
    });
    if (!f) break;
    crumbs.unshift({ id: f.id, name: f.name });
    cursor = f.parentId;
  }

  const [folders, documents] = await Promise.all([
    prisma.folder.findMany({
      where: folderId ? { parentId: folderId } : { parentId: null, companyId, locationId },
      orderBy: { name: "asc" },
      include: { _count: { select: { children: true, documents: true } } },
    }),
    prisma.document.findMany({
      where: folderId ? { folderId } : { folderId: null, companyId, locationId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return { crumbs, folders, documents };
}

export function fileKind(contentType: string, name: string): string {
  const n = name.toLowerCase();
  if (contentType.includes("pdf") || n.endsWith(".pdf")) return "PDF";
  if (contentType.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(n)) return "Excel";
  if (contentType.includes("word") || /\.docx?$/.test(n)) return "Word";
  if (contentType.startsWith("image/")) return "Imagen";
  return "Archivo";
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
