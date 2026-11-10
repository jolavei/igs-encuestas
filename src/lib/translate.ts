// Traducción automática ES → EN para el constructor (botón "Traducir automáticamente").
// Usa Google Cloud Translation (API v2 "basic") con la misma service account de
// BigQuery (GCP_PROJECT_ID / GCP_SA_KEY). Para que funcione:
//   1. Habilitar "Cloud Translation API" en el proyecto de GCP.
//   2. Darle a la service account el rol "Cloud Translation API User"
//      (roles/cloudtranslate.user).
// El resultado es un BORRADOR: el admin lo revisa antes de guardar. Nunca se traduce
// al momento de responder la encuesta.

export class TranslateNotConfiguredError extends Error {
  code = "TRANSLATE_NO_CREDS" as const;
  constructor() {
    super("Faltan las credenciales de Google Cloud (GCP_PROJECT_ID / GCP_SA_KEY).");
    this.name = "TranslateNotConfiguredError";
  }
}

const SCOPE = "https://www.googleapis.com/auth/cloud-translation";
const ENDPOINT = "https://translation.googleapis.com/language/translate/v2";
const BATCH = 100; // la API acepta hasta 128 textos por llamada

let _auth: { getAccessToken(): Promise<string | null | undefined> } | null = null;

async function accessToken(): Promise<string> {
  const key = process.env.GCP_SA_KEY;
  if (!process.env.GCP_PROJECT_ID || !key) throw new TranslateNotConfiguredError();
  if (!_auth) {
    const { GoogleAuth } = await import("google-auth-library");
    _auth = new GoogleAuth({ credentials: JSON.parse(key), scopes: [SCOPE] });
  }
  const token = await _auth.getAccessToken();
  if (!token) throw new Error("No se pudo obtener el token de Google Cloud.");
  return token;
}

// La API devuelve entidades HTML incluso con format=text en algunos casos.
function decodeEntities(s: string): string {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Traduce textos del español al inglés, en el mismo orden. */
export async function translateEsToEn(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  const token = await accessToken();
  const out: string[] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const chunk = texts.slice(i, i + BATCH);
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "x-goog-user-project": process.env.GCP_PROJECT_ID as string,
      },
      body: JSON.stringify({ q: chunk, source: "es", target: "en", format: "text" }),
    });
    if (!r.ok) {
      const body = await r.text();
      const disabled = /SERVICE_DISABLED|has not been used|is disabled/i.test(body);
      const denied = r.status === 403;
      throw new Error(
        disabled
          ? "La API de traducción no está habilitada en Google Cloud (Cloud Translation API)."
          : denied
          ? "La cuenta de servicio no tiene permiso para traducir (rol Cloud Translation API User)."
          : `Error del servicio de traducción (código ${r.status}).`
      );
    }
    const data = (await r.json()) as { data?: { translations?: { translatedText: string }[] } };
    const tr = data.data?.translations ?? [];
    for (let j = 0; j < chunk.length; j++) out.push(decodeEntities(tr[j]?.translatedText ?? ""));
  }
  return out;
}
