import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { gcsConfigured } from "@/lib/gcs";
import { getFolderView, fileKind, fmtSize } from "@/lib/docsBrowser";
import { FolderIcon, FileIcon } from "@/components/icons";
import NewFolderButton from "@/components/docs/NewFolderButton";
import DocumentUploader from "@/components/docs/DocumentUploader";
import DeleteButton from "@/components/docs/DeleteButton";

export default async function DocsAdmin({
  searchParams,
}: {
  searchParams: { companyId?: string; loc?: string; folderId?: string };
}) {
  const { companyId, loc, folderId } = searchParams;

  // 1) Sin empresa: elegir empresa.
  if (!companyId) {
    const companies = await prisma.company.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    });
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Documentos</h1>
        {!gcsConfigured() && <GcsBanner />}
        <p className="text-slate-500">Elige una empresa para gestionar sus documentos.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <Link key={c.id} href={`/admin/documentos?companyId=${c.id}`} className="card hover:border-brand-300">
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    include: { locations: { orderBy: { name: "asc" } } },
  });
  if (!company) return <p className="text-slate-500">Empresa no encontrada.</p>;

  // 2) Empresa elegida pero sin sede: elegir sede (o General).
  if (loc === undefined) {
    return (
      <div className="space-y-6">
        <Header company={company.name} />
        {!gcsConfigured() && <GcsBanner />}
        <p className="text-slate-500">Elige una sede (o General) para ver sus carpetas.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href={`/admin/documentos?companyId=${companyId}&loc=general`} className="card hover:border-brand-300">
            General (toda la empresa)
          </Link>
          {company.locations.map((l) => (
            <Link
              key={l.id}
              href={`/admin/documentos?companyId=${companyId}&loc=${l.id}`}
              className="card hover:border-brand-300"
            >
              {l.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const locationId = loc === "general" ? null : loc;
  const locName = locationId ? company.locations.find((l) => l.id === locationId)?.name : "General";
  const { crumbs, folders, documents } = await getFolderView(companyId, locationId, folderId ?? null);

  const base = `/admin/documentos?companyId=${companyId}&loc=${loc}`;

  return (
    <div className="space-y-5">
      <Header company={company.name} />
      {!gcsConfigured() && <GcsBanner />}

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link href={`/admin/documentos?companyId=${companyId}`} className="hover:text-brand-600">
          {company.name}
        </Link>
        <span>/</span>
        <Link href={base} className="hover:text-brand-600">
          {locName}
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

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-3">
        <NewFolderButton companyId={companyId} locationId={locationId} parentId={folderId ?? null} />
        <DocumentUploader companyId={companyId} locationId={locationId} folderId={folderId ?? null} />
      </div>

      {/* Carpetas */}
      {folders.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <div key={f.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
              <Link href={`${base}&folderId=${f.id}`} className="flex min-w-0 items-center gap-2 hover:text-brand-600">
                <FolderIcon className="shrink-0 text-brand-500" />
                <span className="truncate">{f.name}</span>
                <span className="shrink-0 text-xs text-slate-400">
                  ({f._count.children + f._count.documents})
                </span>
              </Link>
              <DeleteButton
                endpoint={`/api/folders/${f.id}`}
                confirmText={`¿Borrar la carpeta "${f.name}"? (debe estar vacía)`}
              />
            </div>
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
              <th className="px-4 py-2 text-right">Acciones</th>
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
                  <span className="flex justify-end gap-3">
                    <a
                      href={`/api/documents/${d.id}/download`}
                      className="text-xs font-medium text-brand-600 hover:underline"
                    >
                      Descargar
                    </a>
                    <DeleteButton
                      endpoint={`/api/documents/${d.id}`}
                      confirmText={`¿Borrar "${d.name}"?`}
                    />
                  </span>
                </td>
              </tr>
            ))}
            {documents.length === 0 && folders.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                  Carpeta vacía. Crea una carpeta o sube un archivo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Header({ company }: { company: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">Documentos</h1>
      <p className="text-slate-500">{company}</p>
    </div>
  );
}

function GcsBanner() {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      El almacenamiento de archivos aún no está configurado. Sube/descarga no funcionarán
      hasta configurar Google Cloud Storage (ver <code>docs/documentos.md</code>).
    </div>
  );
}
