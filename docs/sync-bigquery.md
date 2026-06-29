# Sincronizar Neon → BigQuery (script automático)

El workflow `.github/workflows/sync-bigquery.yml` corre `scripts/sync-bigquery.mjs`
cada 6 horas (y a mano cuando quieras) para copiar las tablas de Neon a BigQuery.
Luego Dataform arma la tabla ancha por cuestionario.

Solo se sincronizan las tablas de negocio. Se **excluyen** `Account`, `Session` y
`VerificationToken` (tienen tokens de login) y las tablas internas (`_*`).

---

## Paso 1 — Habilitar BigQuery en Google Cloud

1. <https://console.cloud.google.com> → usa el **mismo proyecto** del login de Google
   (o crea uno).
2. **APIs y servicios → Habilitar APIs** → busca y habilita **BigQuery API**.
3. BigQuery necesita **facturación habilitada** en el proyecto (tiene capa gratis: 10 GB
   de almacenamiento y 1 TB de consultas al mes). Menú → **Facturación** → vincula una
   tarjeta. (Con el volumen de encuestas no deberías pagar nada.)

## Paso 2 — Crear la cuenta de servicio (la "llave" para el script)

1. **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**.
   - Nombre: `bigquery-sync`.
2. Asígnale estos roles:
   - **BigQuery Data Editor** (escribir tablas)
   - **BigQuery Job User** (ejecutar cargas/consultas)
3. Crea y descarga una **clave JSON**: entra a la cuenta creada → pestaña **Claves** →
   **Agregar clave → Crear clave nueva → JSON**. Se descarga un archivo `.json`.
   - **Guárdalo bien y no lo subas a GitHub** (es una credencial).

## Paso 3 — Cargar los secretos en GitHub

En tu repo de GitHub → **Settings → Secrets and variables → Actions → New repository secret**.
Crea estos tres:

| Secret | Valor |
|---|---|
| `DATABASE_URL` | el connection string de Neon (el mismo de Vercel) |
| `GCP_PROJECT_ID` | el ID de tu proyecto de Google Cloud (ej. `igs-encuestas-123456`) |
| `GCP_SA_KEY` | el **contenido completo** del archivo `.json` de la cuenta de servicio (ábrelo con un editor y copia todo, pégalo tal cual) |

## Paso 4 — Ejecutarlo

1. En GitHub → pestaña **Actions** → workflow **"Sync Neon → BigQuery"** → botón
   **Run workflow** (ejecución manual).
2. Mira el log: debe decir `Company: 1 filas cargadas`, etc., y al final
   `Listo: 11 tablas, N filas en total`.
3. De ahí en adelante corre solo cada 6 horas. (Cambia el `cron` en el YAML si quieres
   otra frecuencia.)

Verifica en BigQuery (consola → BigQuery): debería existir el dataset **`raw_postgres`**
con las tablas `Company`, `Answer`, `Question`, etc.

---

## Paso 5 — Dataform: tabla ancha por cuestionario

Con los datos crudos ya en BigQuery:

1. Google Cloud → **Dataform** → crea un repositorio y un *workspace*.
2. En la app (admin → un cuestionario → panel **"Tabla en BigQuery (Dataform)"**):
   - **Generar definición** → copia el archivo `definitions/sources.js` (una sola vez) y
     el `definitions/<cuestionario>.sqlx` a tu workspace de Dataform.
3. En Dataform: **Start execution / Run** → crea la tabla ancha en el dataset `encuestas`,
   con una columna por pregunta y `company_name` para comparar empresas.
4. (Opcional) **Looker Studio** → conéctate a `encuestas` para los dashboards.

> El script de sync deja los datos crudos al día; Dataform los transforma. Si agregas
> preguntas o cuestionarios, regenera el `.sqlx` desde la app y vuelve a ejecutar Dataform.

---

## Notas

- **Carga completa (full refresh):** cada corrida reemplaza las tablas crudas con el estado
  actual de Neon (`WRITE_TRUNCATE`). Simple y sin duplicados. Para el volumen de encuestas
  es más que suficiente.
- **Probar local (solo lectura):** `DRY_RUN=true` muestra qué leería sin tocar BigQuery:
  ```bash
  # PowerShell:  $env:DRY_RUN="true"; node --env-file=.env scripts/sync-bigquery.mjs
  ```
- **Costo:** dentro de capa gratis para este volumen. BigQuery cobra por almacenamiento y
  consultas; aquí es mínimo.
