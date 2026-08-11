import { Storage } from "@google-cloud/storage";

// Config desde variables de entorno (ver docs/documentos.md).
const PROJECT_ID = process.env.GCP_PROJECT_ID;
const SA_KEY = process.env.GCP_SA_KEY;
const BUCKET = process.env.GCS_BUCKET;

export function gcsConfigured(): boolean {
  return !!(PROJECT_ID && SA_KEY && BUCKET);
}

let storage: Storage | null = null;
function getBucket() {
  if (!gcsConfigured()) throw new Error("GCS no configurado (faltan GCP_PROJECT_ID / GCP_SA_KEY / GCS_BUCKET).");
  if (!storage) {
    storage = new Storage({ projectId: PROJECT_ID, credentials: JSON.parse(SA_KEY as string) });
  }
  return storage.bucket(BUCKET as string);
}

// URL firmada para SUBIR (PUT directo del navegador a GCS). El cliente debe usar
// exactamente el mismo Content-Type al hacer el PUT.
export async function signUploadUrl(objectPath: string, contentType: string) {
  const [url] = await getBucket()
    .file(objectPath)
    .getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + 15 * 60 * 1000,
      contentType,
    });
  return url;
}

// URL firmada para DESCARGAR (GET), corta duración, fuerza descarga con el nombre.
export async function signDownloadUrl(objectPath: string, filename: string) {
  const [url] = await getBucket()
    .file(objectPath)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 10 * 60 * 1000,
      responseDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`,
    });
  return url;
}

// Descarga el objeto al servidor (para parsear/ingestar). Devuelve el binario.
export async function downloadObject(objectPath: string): Promise<Buffer> {
  const [contents] = await getBucket().file(objectPath).download();
  return contents;
}

export async function deleteObject(objectPath: string) {
  try {
    await getBucket().file(objectPath).delete({ ignoreNotFound: true });
  } catch {
    // no bloquear el borrado del registro por un fallo en el objeto
  }
}
