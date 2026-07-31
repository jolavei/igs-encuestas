# Consolidar Google Sheets de tiempos → BigQuery

Consolida los 3 Google Sheets de "levantamiento de tiempos de procesos" (respuestas
de Google Forms) en **una** tabla de BigQuery con el **mismo esquema** que
`encuestas.mediciones_de_tiempos`, para poder unir el **histórico** con las
mediciones que se levantan desde la app.

- Script: [`scripts/sync-sheets-tiempos.mjs`](../scripts/sync-sheets-tiempos.mjs)
- Mapeo por sede: [`scripts/sheets-tiempos-map.mjs`](../scripts/sheets-tiempos-map.mjs)
- Corre dentro del workflow [`sync-bigquery.yml`](../.github/workflows/sync-bigquery.yml),
  a las **00/06/12/18 hora de Chile** (mismo cron y misma cuenta de servicio que el
  sync de Neon).

## Fuentes

| Sede | Google Sheet (título) | Pestaña | Sede en la app (`location_name`) |
|---|---|---|---|
| IQQ | Mediciones tiempo SCDA (Respuestas) | Respuestas de formulario 2 | Aeropuerto Diego Aracena |
| CJC | Mediciones tiempo SCCF (Respuestas) | Respuestas de formulario 1 | Aeropuerto El Loa |
| PMC | Mediciones SCTE - Tiempos y Encuestas | Respuestas de formulario 1 | Aeropuerto El Tepual |

Los 3 formularios divergieron (IQQ/PMC tienen encabezados **duplicados** por sección;
CJC usa `snake_case`). El mapeo se hace por **nombre de encabezado + ocurrencia**, y el
script resuelve el índice real leyendo la fila 1 de cada hoja en cada corrida.

## Qué hace el script

1. Lee cada hoja con la **Google Sheets API v4** (cuenta de servicio, solo lectura).
2. Se queda solo con **Check-in, AVSEC y Retiro de equipaje** (excluye "Reporte Diario").
3. Arma cada `*_t1/t2/t3` como **TIMESTAMP** = fecha de la "Marca temporal" + hora-del-día
   de la medición, en **hora de Chile** (respeta horario de verano). Si el fin es menor
   al inicio, asume **cruce de medianoche** (+24 h).
4. Normaliza `process`, `checkin_airline`, `location_name` y `company_name` a los valores
   exactos de la app (para que el UNION calce).
5. Los datos sin columna destino (N° de counters, N° de máquinas de rayos X, aerolínea del
   retiro) se guardan en los `*_comments` (no se pierden).
6. Carga completa (`WRITE_TRUNCATE`) a `tiempos_procesos.mediciones_sheets`. Idempotente.

## Puesta en marcha (una sola vez)

### 1. Habilitar la Google Sheets API
Google Cloud → proyecto `igs-encuestas` → **APIs y servicios → Habilitar APIs** →
busca **Google Sheets API** → Habilitar.

### 2. Compartir los 3 sheets con la cuenta de servicio
Comparte cada Google Sheet (botón **Compartir**, rol **Lector**) con:

```
bigquery-sync@igs-encuestas.iam.gserviceaccount.com
```

(Ya hecho. El de PMC lo debe compartir su dueño, `mbohn@aerodromosigs.cl`.)

> La SA ya tiene los roles de BigQuery del sync existente (Data Editor + Job User); no
> hace falta rol IAM extra para Sheets: basta con compartir los archivos.

### 3. Dataset de salida
El dataset `tiempos_procesos` (multirregión **US**) lo crea el script solo en su primera
corrida. Si prefieres crearlo a mano:

```sql
CREATE SCHEMA IF NOT EXISTS `igs-encuestas.tiempos_procesos` OPTIONS(location = 'US');
```

### 4. Primera corrida y verificación
GitHub → **Actions** → workflow **"Sync Neon → BigQuery"** → **Run workflow**.
En el log del step *"Consolidar Google Sheets de tiempos"* revisa el conteo por sede y
proceso, y las advertencias (⚠ columnas no encontradas / aerolíneas sin normalizar).
Luego, en BigQuery, verifica `tiempos_procesos.mediciones_sheets`.

### 5. Dataform (tabla consolidada app + histórico)
Copia los archivos de [`dataform/`](../dataform/README.md) a tu repo Dataform y haz push
a `main`. Eso crea `encuestas.mediciones_tiempos_consolidado` (con columna `origen`), que
es la fuente del futuro Dashboard.

## Probar en local (opcional)

Requiere el JSON de la cuenta de servicio en `GCP_SA_KEY`. Modo simulación (no escribe en
BigQuery, solo lee las hojas e imprime estadísticas y una muestra):

```bash
DRY_RUN=true GCP_SA_KEY="$(cat sa-key.json)" node scripts/sync-sheets-tiempos.mjs
```

## Notas

- **Ajustar el mapeo:** si un formulario cambia de columnas, edita
  `scripts/sheets-tiempos-map.mjs` (nombres/ocurrencias). El script avisa en el log si no
  encuentra una columna esperada.
- **Aerolínea del check-in:** `bagdrop`/mostrador → `LATAM Airlines - Counter`;
  `Kiosko/self` → `LATAM Airlines - Quiosco`. El texto original queda en `checkin_comments`.
- **Costo:** dentro de la capa gratis para este volumen.
