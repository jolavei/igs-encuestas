# Dataform — modelo consolidado de tiempos

Estos archivos **no** viven en este repo web: son para copiarlos a tu repositorio
**Dataform** (proyecto `igs-encuestas`, el mismo donde ya está `mediciones_de_tiempos`).

Copia a la carpeta `definitions/` de tu workspace Dataform:

| Archivo aquí | Va a | Qué hace |
|---|---|---|
| `sources_tiempos.js` | `definitions/sources_tiempos.js` | Declara `tiempos_procesos.mediciones_sheets` como fuente (`ref`). |
| `mediciones_tiempos_consolidado.sqlx` | `definitions/mediciones_tiempos_consolidado.sqlx` | Tabla `encuestas.mediciones_tiempos_consolidado` = histórico (Sheets) + app. |

Pasos:

1. Copia ambos archivos a `definitions/` en tu workspace Dataform.
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
