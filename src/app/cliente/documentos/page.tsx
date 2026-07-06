import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { canAccessDoc } from "@/lib/docsAccess";
import { getFolderView, fileKind, fmtSize } from "@/lib/docsBrowser";
import { FolderIcon, FileIcon } from "@/components/icons";

export default async function ClienteDocs({
  searchParams,
}: {
  searchParams: { folderId?: string };
}) {
  const user = await getSessionUser();
  if (!user!.companyId) {
    return (
      <div className="card">
        <h1 className="text-xl font-bold">Documentos</h1>
        <p className="mt-2 text-slate-600">
          Tu usuario no está vinculado a una empresa. Pide a un administrador que asocie tu
          cuenta.
        </p>
      </div>
    );
  }

  const companyId = user!.companyId;
  const locationId = user!.locationId;
  const folderId = searchParams.folderId ?? null;

  // Verificar acceso a la carpeta pedida.
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || !canAccessDoc(user!, folder)) {
      return <p className="text-slate-500">No tienes acceso a esta carpeta.</p>;
    }
  }

  // Raíz del cliente: sus carpetas de sede + las generales de la empresa.
  let crumbs: { id: string | null; name: string }[] = [];
  let folders: any[];
  let documents: any[];
  if (folderId) {
    ({ crumbs, folders, documents } = await getFolderView(companyId, locationId, folderId));
  } else {
    const scope = { companyId, OR: [{ locationId: null }, { locationId }] };
    [folders, documents] = await Promise.all([
      prisma.folder.findMany({
        where: { parentId: null, ...scope },
        orderBy: { name: "asc" },
        include: { _count: { select: { children: true, documents: true } } },
      }),
      prisma.document.findMany({
        where: { folderId: null, ...scope },
        orderBy: { createdAt: "desc" },
      }),
    ]);
  }

  const base = `/cliente/documentos`;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Documentos</h1>

      <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link href={base} className="hover:text-brand-600">
          Inicio
        </Link>
        {crumbs.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span>/</span>
            <Link href={`${base}?folderId=${c.id}`} className="hover:text-brand-600">
              {c.name}
            </Link>
          </span>
        ))}
      </div>

      {folders.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <Link
              key={f.id}
              href={`${base}?folderId=${f.id}`}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white p-3 hover:border-brand-300"
            >
              <FolderIcon className="shrink-0 text-brand-500" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-slate-400">
                ({f._count.children + f._count.documents})
              </span>
            </Link>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-2">Archivo</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2 text-right">Tamaño</th>
              <th className="px-4 py-2 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    <FileIcon className="shrink-0 text-slate-400" />
                    {d.name}
                  </span>
                </td>
                <td className="px-4 py-2 text-slate-500">{fileKind(d.contentType, d.name)}</td>
                <td className="px-4 py-2 text-right text-slate-500">{fmtSize(d.size)}</td>
                <td className="px-4 py-2 text-right">
                  <a
                    href={`/api/documents/${d.id}/download`}
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    Descargar
                  </a>
                </td>
              </tr>
            ))}
            {documents.length === 0 && folders.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  No hay documentos disponibles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
