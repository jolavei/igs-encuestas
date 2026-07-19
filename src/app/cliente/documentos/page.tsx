import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/rbac";
import { getUserScope } from "@/lib/userScope";
import { getFolderView, fileKind, fmtSize } from "@/lib/docsBrowser";
import { FolderIcon, FileIcon } from "@/components/icons";

export default async function ClienteDocs({
  searchParams,
}: {
  searchParams: { loc?: string; folderId?: string };
}) {
  const user = await getSessionUser();
  const scope = await getUserScope(user!.id);

  if (scope.locations.length === 0) {
    return (
      <div className="card">
        <h1 className="text-xl font-bold">Documentos</h1>
        <p className="mt-2 text-slate-600">
          Tu usuario aún no está vinculado a ninguna sede. Pide a un administrador que asocie tu
          cuenta.
        </p>
      </div>
    );
  }

  const { loc, folderId } = searchParams;

  // 1) Sin sede elegida: elegir una de sus sedes.
  if (!loc) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Documentos</h1>
        <p className="text-slate-500">Elige una sede para ver sus documentos.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {scope.locations.map((l) => (
            <Link
              key={l.id}
              href={`/cliente/documentos?loc=${l.id}`}
              className="card hover:border-brand-300"
            >
              {l.company.name} · {l.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  // La sede pedida debe ser una de las suyas.
  const sede = scope.locations.find((l) => l.id === loc);
  if (!sede) return <p className="text-slate-500">No tienes acceso a esta sede.</p>;

  // La carpeta pedida debe pertenecer a esta sede.
  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.locationId !== loc) {
      return <p className="text-slate-500">No tienes acceso a esta carpeta.</p>;
    }
  }

  const { crumbs, folders, documents } = await getFolderView(
    sede.companyId,
    loc,
    folderId ?? null
  );
  const base = `/cliente/documentos?loc=${loc}`;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Documentos</h1>
        <p className="text-slate-500">
          {sede.company.name} · {sede.name}
        </p>
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link href="/cliente/documentos" className="hover:text-brand-600">
          Sedes
        </Link>
        <span>/</span>
        <Link href={base} className="hover:text-brand-600">
          {sede.name}
        </Link>
        {crumbs.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <span>/</span>
            <Link href={`${base}&folderId=${c.id}`} className="hover:text-brand-600">
              {c.name}
            </Link>
          </span>
        ))}
      </div>

      {/* Carpetas */}
      {folders.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <Link
              key={f.id}
              href={`${base}&folderId=${f.id}`}
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

      {/* Documentos */}
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
