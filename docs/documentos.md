# Módulo de Documentos — configurar almacenamiento (Google Cloud Storage)

Los archivos se guardan en un bucket de **Google Cloud Storage** (privado). La app sube
con URL firmada (directo del navegador a GCS) y descarga con URL firmada de corta duración,
verificando acceso (admin, o el cliente de esa empresa+sede). El binario nunca queda
público.

## Paso 1 — Crear el bucket

1. Google Cloud → **Cloud Storage → Buckets → Crear**.
2. Nombre único (ej. `igs-documentos-<tuproyecto>`), región cercana.
3. **Control de acceso: uniforme**. Deja el bucket **privado** (no marcar acceso público).

## Paso 2 — Permisos de la cuenta de servicio

Reusa la cuenta de servicio que ya creaste para BigQuery (`bigquery-sync@...`) o crea una:

1. IAM → a esa cuenta de servicio, agrega el rol **Storage Object Admin**
   (`roles/storage.objectAdmin`) — a nivel del bucket o del proyecto.
2. Las **URLs firmadas** se generan con la llave privada del JSON de la cuenta de servicio
   (ya la tienes en `GCP_SA_KEY`). No requiere permisos extra.

## Paso 3 — CORS del bucket (para subir desde el navegador)

El navegador sube con `PUT` directo a GCS, así que el bucket debe permitir CORS desde tu
dominio. Crea un archivo `cors.json`:

```json
[
  {
    "origin": ["https://igs-encuestas.vercel.app", "http://localhost:3000"],
    "method": ["PUT", "GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
```

Aplícalo (Cloud Shell o gcloud local):

```bash
gcloud storage buckets update gs://TU_BUCKET --cors-file=cors.json
```

## Paso 4 — Variables de entorno en Vercel

En Vercel → Settings → Environment Variables (Production):

| Variable | Valor |
|---|---|
| `GCP_PROJECT_ID` | tu ID de proyecto de Google Cloud |
| `GCP_SA_KEY` | el JSON completo de la cuenta de servicio (el mismo del sync) |
| `GCS_BUCKET` | el nombre del bucket (sin `gs://`) |

Redeploy. Mientras falten estas variables, la app muestra un aviso y la subida/descarga
quedan deshabilitadas (el resto del módulo funciona).

> Para probar en local, pon las mismas variables en tu `.env`.

## Paso 5 — Asociar clientes a su empresa + sede

En **Usuarios y roles**, a cada usuario **CLIENT** asígnale su **empresa** y su **sede**.
Ese cliente verá en su panel (Documentos) solo las carpetas/archivos de su sede + los de
alcance **General** (sin sede) de su empresa.

## Cómo funciona (resumen técnico)

- `src/lib/gcs.ts` — cliente GCS + URLs firmadas (subir/descargar) + borrar objeto.
- Subida: `POST /api/documents/sign-upload` (admin) → URL firmada `PUT` → el navegador sube
  → `POST /api/documents` registra el archivo.
- Descarga: `GET /api/documents/[id]/download` verifica acceso y redirige a una URL firmada
  `GET` de 10 min.
- Carpetas anidadas (`Folder.parentId`); alcance por empresa + sede (`locationId`, null =
  General). Acceso del cliente en `src/lib/docsAccess.ts`.
