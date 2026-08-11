# Ingesta de microdata ACI ASQ Departures

Permite cargar en la web el Excel semestral de ACI ASQ ("Departures Regional — Data
EXCEL Tablet"): una fila por pasajero, ~114 variables. La microdata se normaliza a un
esquema canónico y se guarda en **BigQuery** (`encuestas.asq_departures`), reemplazando el
pegado manual al Google Sheet.

> No confundir con **Encuestas ASQ** (`/admin/compliance`), que son los conteos de
> cumplimiento (target vs. realizadas) que trae el scraper del portal. Esto es la microdata
> de respuestas.

## Qué contiene el archivo

- Hoja **`Data`**: los pasajeros (ratings 1–5; celda vacía / `None` = N/A), scores de
  categoría, índices, pesos, datos de vuelo y demográficos.
- Un archivo trae **todo el panel regional** (varios aeropuertos, no sólo los propios). Los
  aeropuertos mapeados a una empresa en `AsqAirportMapping` se marcan `_is_own_airport = true`;
  el resto son pares de benchmarking.
- Hojas auxiliares (codebook + listas) se ignoran; sólo se lee `Data`.

## Esquema canónico

La fuente de verdad es [`src/lib/asq/departuresSchema.ts`](../src/lib/asq/departuresSchema.ts):
las **114 columnas** del formato definitivo con su tipo BigQuery. El mapeo es **por nombre de
header** (no por posición), así reordenar columnas no rompe nada. Reglas clave:

- `Column` y `class` (columnas vestigiales del Sheet histórico) se **descartan**.
- Columnas ausentes en el archivo (p. ej. `Language` en el Sheet viejo) quedan **NULL**.
- Columnas inesperadas se guardan en **`_extra`** (JSON) como red de seguridad —no se pierden—.
- Fechas → `DATE` (`YYYY-MM-DD`), horas/duraciones → texto `HH:MM:SS`, ratings/códigos →
  `INT64`, `Weight` → `FLOAT64`.

Además se agregan metadatos por fila: `_ingest_id`, `_ingested_at`, `_source_file`,
`_season_label`, `_is_own_airport`, `_row_key` (`Quarter|QuestNo`, para dedupe) y `_extra`.

## Flujo en la web (`/admin/asq`, sólo ADMIN)

1. **Subir** el `.xlsx` → va directo a GCS con URL firmada (evita el límite de body de Vercel).
2. **Analizar** (`POST /api/asq/departures/analyze`): preview sin escribir nada. Muestra filas,
   columnas reconocidas (X/114), temporada, filas propias, cuántas filas se **reemplazarían** y
   avisos de columnas faltantes / no reconocidas / descartadas.
3. **Ingestar** (`POST /api/asq/departures/ingest`): carga real e **idempotente**.

Cada carga queda registrada en Postgres (`AsqDepartureImport`) para el historial/auditoría.

## Idempotencia — "un archivo = un semestre"

Antes de cargar se **borran** las filas de las temporadas (`Quarter`) presentes en el archivo y
luego se hace load-append. Re-subir un archivo corregido reemplaza esa temporada limpio, sin
duplicar. Los load jobs no usan el streaming buffer, por eso el `DELETE` inmediato funciona.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `GCP_PROJECT_ID`, `GCP_SA_KEY` | BigQuery (la SA `bigquery-sync@` ya tiene `dataEditor`). |
| `GCS_BUCKET` | Bucket donde se sube el `.xlsx`. |
| `BQ_LOCATION` | Ubicación del dataset (default `US`). |
| `ASQ_BQ_DATASET`, `ASQ_BQ_TABLE` | Override del destino (default `encuestas` / `asq_departures`). |

La tabla se crea sola en la primera ingesta (`ensureTable`, clustering por `Quarter, Airport`).

## Backfill del histórico (2019 → hoy)

Para que las tendencias arranquen en 2019, se carga una vez el Google Sheet
**"ACI ASQ Survey Results"** por el **mismo pipeline**:

1. En el Sheet: **Archivo → Descargar → Microsoft Excel (.xlsx)**.
2. Ejecutar (dry-run primero para revisar el plan):

```bash
npm run backfill:asq -- "ruta/al/ACI ASQ Survey Results.xlsx" --dry-run
```

3. Si el plan se ve bien, correr la carga real:

```bash
npm run backfill:asq -- "ruta/al/ACI ASQ Survey Results.xlsx"
```

Opciones: `--sheet=NOMBRE` (pestaña), `--own=ARI,CJC,IQQ` (propios, si no usa
`AsqAirportMapping`), `--quarters=SU19,WI19` (sólo esas), `--force` (seguir aunque se
reconozcan pocas columnas). El backfill carga **temporada por temporada** (memoria acotada) y es
idempotente igual que la web: volver a correrlo reemplaza cada temporada, no duplica.

## Verificación / tests

- Unitarios (Vitest): `src/lib/asq/*.test.ts` — esquema, coerción, normalización (formato Excel
  y drift del Sheet), NDJSON y orquestación. `npm test`.
- El motor se validó en seco contra el archivo real: 5.848 filas → 5.848 líneas NDJSON válidas,
  114/114 columnas, 0 tipos inesperados.

## Problemas comunes

- **"Faltan credenciales de BigQuery"** (503 al ingestar): faltan `GCP_PROJECT_ID`/`GCP_SA_KEY`.
- **Muchas columnas faltantes en el preview**: probablemente la fila 1 no son headers o es otra
  pestaña; en el backfill usar `--sheet=NOMBRE`.
- **La migración no está aplicada** (`AsqDepartureImport`): corre `prisma migrate deploy` (el
  deploy de Vercel lo hace) o `prisma migrate dev` en local.
