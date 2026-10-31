# Dataform — modelo consolidado de tiempos

Estos archivos **no** viven en este repo web: son para copiarlos a tu repositorio
**Dataform** (proyecto `igs-encuestas`, el mismo donde ya está `mediciones_de_tiempos`).

Copia a la carpeta `definitions/` de tu workspace Dataform:

| Archivo aquí | Va a | Qué hace |
|---|---|---|
| `sources_tiempos.js` | `definitions/sources_tiempos.js` | Declara `tiempos_procesos.mediciones_sheets` como fuente (`ref`). |
| `mediciones_de_tiempos.sqlx` | `definitions/mediciones_de_tiempos.sqlx` (reemplaza el existente) | Tabla ancha `encuestas.mediciones_de_tiempos` del cuestionario de la web, con los tres hitos de cada proceso. |
| `mediciones_tiempos_consolidado.sqlx` | `definitions/mediciones_tiempos_consolidado.sqlx` | Tabla `encuestas.mediciones_tiempos_consolidado` = histórico (Sheets) + app. |

Pasos:

1. Copia los archivos a `definitions/` en tu workspace Dataform.
2. **Commit + Push a la rama `main`** del repo Dataform (el workflow ejecuta lo que
   esté en `main`, no lo que quede en un workspace de desarrollo).
3. Corre una vez desde Dataform (**Start execution**, tag `encuestas`) para crear la
   tabla; de ahí en adelante el workflow `sync-bigquery` la reconstruye cada 6 h,
   justo después de refrescar `mediciones_sheets` y `mediciones_de_tiempos`.

> Requisito: el dataset de salida `encuestas` ya existe (lo usa `mediciones_de_tiempos`).
> El dataset `tiempos_procesos` lo crea solo el script `sync-sheets-tiempos.mjs` en su
> primera corrida (multirregión US).

La tabla resultante `encuestas.mediciones_tiempos_consolidado` tiene una columna
`origen` (`app` / `form_historico`) y es la que conectarás al Dashboard / Looker.

## Fila vs atención (desde octubre de 2026)

Desde la versión 6 del cuestionario «Mediciones de tiempos», cada proceso con fila
registra tres hitos: **t1** ingreso a la fila, **t2** salida de la fila (inicio de la
atención) y **t3** fin de la atención. Fila = t2 − t1 (a la que aplica el Estándar IATA),
atención = t3 − t2 (sin meta) y total = t3 − t1. El histórico de Sheets solo midió la
fila: en la consolidada sus `*_t3` quedan en NULL.

`mediciones_de_tiempos.sqlx` se generó con el generador de la web (Cuestionarios →
Dataform) desde la versión 7, renombrando la columna del tercer hito de check-in a
`checkin_t3` (en el cuestionario su clave es `check_in_t3`). Mientras estas definiciones
no estén desplegadas, los informes muestran solo la fila, sin error.
