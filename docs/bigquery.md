# Sync Postgres → BigQuery y modelo analítico

**Regla:** nunca se escribe a BigQuery desde el formulario. Postgres es la fuente de
verdad transaccional; BigQuery es el destino analítico, alimentado por **batch**.

## Movimiento de datos (no usar scripts caseros)

Preferir una herramienta administrada — maneja reintentos, esquema y CDC mejor que un
cron en Python:

- **Google Datastream** (CDC nativo Postgres → BigQuery), o
- **Airbyte / Fivetran** (conector Postgres → BigQuery).

`dbt` queda para **transformaciones dentro de BigQuery**, no para mover datos.

La columna `ResponseSet.syncedAt` permite marcar/auditar el avance del batch si en algún
momento se hace un export incremental propio.

## Esquema analítico (FORMATO LARGO)

El modelo operacional ya está en formato largo (`Answer` = una fila por respuesta a una
pregunta), así que se replica casi 1:1. Tabla de hechos sugerida en BigQuery:

```sql
-- fact_answers: una fila por respuesta a una pregunta
CREATE TABLE analytics.fact_answers (
  answer_id        STRING,
  response_set_id  STRING,
  question_id      STRING,
  equivalence_key  STRING,   -- comparar series entre versiones
  question_type    STRING,   -- LIKERT | NPS | ...
  company_id       STRING,
  location_id      STRING,
  questionnaire_id STRING,
  version_id       STRING,
  version_number   INT64,
  source           STRING,   -- FIELD | QR_PUBLIC
  value_number     FLOAT64,
  value_text       STRING,
  value_date       TIMESTAMP,
  responded_at     TIMESTAMP
)
PARTITION BY DATE(responded_at)
CLUSTER BY company_id, location_id, equivalence_key;
```

## Comparabilidad entre versiones

`equivalence_key` (campo `Question.equivalenceKey`) es lo que permite comparar la misma
métrica aunque el cuestionario haya cambiado de forma. Ej: todas las preguntas NPS marcadas
con `nps_general` se agregan juntas a lo largo del tiempo, sin importar la versión.

## Métricas (dbt models)

```sql
-- NPS por sede/mes
SELECT
  location_id,
  DATE_TRUNC(DATE(responded_at), MONTH) AS mes,
  (COUNTIF(value_number >= 9) - COUNTIF(value_number <= 6)) / COUNT(*) * 100 AS nps
FROM analytics.fact_answers
WHERE equivalence_key = 'nps_general'
GROUP BY 1, 2;
```

## Tabla por cuestionario (Dataform) — generada desde la web

Cada cuestionario tiene su **tabla ancha** en BigQuery (una columna por pregunta). La web
**no escribe en BigQuery**: en el detalle del cuestionario (admin) hay un panel
**"Tabla en BigQuery (Dataform)"** que genera los archivos `.sqlx` para tu repo Dataform.

Flujo:

1. En el builder, cada pregunta tiene 3 campos de mapeo BQ: **nombre de columna**,
   **tipo de dato** (STRING/INT64/FLOAT64/NUMERIC/BOOL/DATE/TIMESTAMP) y **detalle**.
2. El panel genera dos archivos:
   - `definitions/sources.js` — declara las tablas crudas que Datastream sincroniza
     (una sola vez por proyecto Dataform).
   - `definitions/<empresa>__<cuestionario>.sqlx` — la tabla ancha del cuestionario.
3. Commiteas esos archivos en tu repositorio Dataform (conectado a BigQuery) y Dataform
   los compila/materializa en el dataset `encuestas`.

El `.sqlx` **pivotea** el dato largo a ancho usando `equivalenceKey` como llave estable
entre versiones (si no defines `equivalenceKey`, se deriva del nombre de columna). Ejemplo
generado:

La tabla es **una por cuestionario** (no por empresa). Como un cuestionario puede usarse
en varias empresas, incluye una columna `company_name` para comparar resultados entre
empresas con el mismo instrumento (el objetivo de benchmarking del producto).

```sqlx
config {
  type: "table",
  schema: "encuestas",
  name: "satisfaccion_de_huespedes",
  columns: {
    company_name: "Empresa (comparar el mismo cuestionario entre empresas)",
    nps_recomendacion: "Probabilidad de recomendación (0-10)",
    csat_limpieza: "Satisfacción con limpieza (1-5)"
  }
}

SELECT
  rs.id AS response_id,
  co.name AS company_name,
  v.versionNumber AS version_number,
  CAST(MAX(IF(q.equivalenceKey = 'nps_general',  a.valueNumber, NULL)) AS INT64) AS nps_recomendacion,
  CAST(MAX(IF(q.equivalenceKey = 'csat_limpieza', a.valueNumber, NULL)) AS INT64) AS csat_limpieza
FROM ${ref("ResponseSet")} rs
JOIN ${ref("QuestionnaireVersion")} v ON v.id = rs.versionId
LEFT JOIN ${ref("Location")} loc ON loc.id = rs.locationId
LEFT JOIN ${ref("Company")}  co  ON co.id = loc.companyId
LEFT JOIN ${ref("Answer")}   a ON a.responseSetId = rs.id
LEFT JOIN ${ref("Question")} q ON q.id = a.questionId
WHERE v.questionnaireId = '...'
GROUP BY 1, 2, 3
```

> **Ajusta** los nombres de tabla/columna fuente y los datasets (`raw_postgres`,
> `encuestas`) en `src/lib/dataform.ts` para que calcen con tu sync real.

### Integración más profunda (opcional, V1.1+)

Hoy la web **genera** los archivos y tú los commiteas (nivel recomendado: respeta
"no escribir en BQ desde la app" y deja la revisión en el repo). Si más adelante quieres
que la web los publique sola, se puede llamar a la **Dataform API** (o escribir al repo Git)
desde un servicio backend con credenciales GCP — sin tocar BigQuery directamente.

## Reportería

- **MVP:** Looker Studio embebido sobre estas tablas (iteración rápida).
- **In-app (V1.1):** dashboards con Recharts solo si se necesita interacción que Looker no
  da (filtros cruzados muy específicos, white-labeling por cliente).

## Privacidad (Ley 19.628)

Las respuestas vía QR pueden traer datos personales. Antes de exponer en BigQuery:
anonimizar/excluir campos de texto libre que puedan contener PII, definir política de
retención, y registrar consentimiento en el formulario público.
