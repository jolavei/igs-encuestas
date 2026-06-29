// Generador de definiciones Dataform: pivotea el dato LARGO (sincronizado desde
// Postgres a BigQuery) a una tabla ANCHA por cuestionario, una columna por pregunta
// con el nombre / tipo / descripción que el admin definió en el builder.
//
// La web NO escribe en BigQuery: solo genera estos archivos para tu repo Dataform.

import type { QuestionType } from "@/lib/questionTypes";

export const BQ_TYPES = [
  "STRING",
  "INT64",
  "FLOAT64",
  "NUMERIC",
  "BOOL",
  "DATE",
  "TIMESTAMP",
] as const;
export type BqType = (typeof BQ_TYPES)[number];

// Dataset BQ donde Datastream deja las tablas crudas de Postgres, y el de salida.
export const RAW_DATASET = "raw_postgres";
export const OUTPUT_DATASET = "encuestas";

// Tablas fuente que necesita el pivote.
const SOURCE_TABLES = [
  "ResponseSet",
  "QuestionnaireVersion",
  "Question",
  "Answer",
  "Location",
  "Company",
];

export function sanitizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 200);
}

// Tipo BQ por defecto según el tipo de pregunta (si el admin no lo fijó).
export function defaultBqType(type: QuestionType): BqType {
  switch (type) {
    case "NPS":
    case "LIKERT":
      return "INT64";
    case "NUMBER":
      return "FLOAT64";
    case "DATETIME":
      return "TIMESTAMP";
    default:
      return "STRING"; // TEXT, SINGLE_CHOICE, MULTI_CHOICE
  }
}

// Columna fuente (formato largo) que guarda el valor según el tipo de pregunta.
function valueColumn(type: QuestionType): string {
  switch (type) {
    case "NPS":
    case "LIKERT":
    case "NUMBER":
      return "a.valueNumber";
    case "DATETIME":
      return "a.valueDate";
    case "MULTI_CHOICE":
      return "a.valueJson"; // array serializado como JSON (STRING)
    default:
      return "a.valueText"; // TEXT, SINGLE_CHOICE
  }
}

export type GenQuestion = {
  type: QuestionType;
  text: string;
  equivalenceKey: string | null;
  bqColumnName: string | null;
  bqType: string | null;
  bqDescription: string | null;
};

export type GenInput = {
  questionnaireId: string;
  questionnaireTitle: string;
  companyNames: string[]; // empresas que usan el cuestionario (para la descripción)
  questions: GenQuestion[];
};

// Clave de pivote: equivalenceKey si existe, si no el nombre de columna saneado.
function pivotKey(q: GenQuestion): string {
  return q.equivalenceKey || sanitizeName(q.bqColumnName || q.text);
}

function columnName(q: GenQuestion): string {
  return sanitizeName(q.bqColumnName || q.equivalenceKey || q.text);
}

/** Archivo de fuentes (declaraciones). Se genera UNA sola vez por proyecto Dataform. */
export function generateSourcesFile(): string {
  return `// definitions/sources.js — declara las tablas crudas que Datastream sincroniza
// desde Postgres a BigQuery. Genera este archivo UNA sola vez.
// Ajusta RAW si tu dataset de origen tiene otro nombre.

const RAW = "${RAW_DATASET}";

${JSON.stringify(SOURCE_TABLES)}.forEach((name) => {
  declare({ schema: RAW, name });
});
`;
}

/** Definición .sqlx de la tabla ancha de UN cuestionario (una fila por respondente,
 *  una columna por pregunta). Incluye company_name para comparar entre empresas. */
export function generateTableSqlx(input: GenInput): { fileName: string; content: string } {
  const tableName = sanitizeName(input.questionnaireTitle);

  const mapped = input.questions.filter((q) => q.bqColumnName || q.equivalenceKey);

  const columnsDoc: Record<string, string> = {
    response_id: "ID único de la respuesta",
    company_name: "Empresa (permite comparar el mismo cuestionario entre empresas)",
    location_name: "Sede / ubicación",
    source: "Origen del dato (FIELD = encuestador, QR_PUBLIC = QR)",
    responded_at: "Fecha y hora de la respuesta",
    version_number: "Versión del cuestionario con que se capturó",
  };

  const selectCols = mapped.map((q) => {
    const col = columnName(q);
    const key = pivotKey(q);
    const bqType = (q.bqType as BqType) || defaultBqType(q.type);
    const expr = `MAX(IF(q.equivalenceKey = '${key}', ${valueColumn(q.type)}, NULL))`;
    columnsDoc[col] = q.bqDescription || q.text;
    return `  CAST(${expr} AS ${bqType}) AS ${col}`;
  });

  const columnsBlock = Object.entries(columnsDoc)
    .map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`)
    .join(",\n");

  const empresas = input.companyNames.length
    ? input.companyNames.join(", ")
    : "sin empresas asignadas";

  const content = `config {
  type: "table",
  schema: "${OUTPUT_DATASET}",
  name: "${tableName}",
  description: ${JSON.stringify(
    `Respuestas (formato ancho) del cuestionario "${input.questionnaireTitle}". Empresas: ${empresas}`
  )},
  columns: {
${columnsBlock}
  },
  tags: ["encuestas"]
}

-- NOTA: los nombres de tabla/columna fuente (ResponseSet, Answer, valueNumber, ...)
-- asumen el camelCase de Prisma preservado por Datastream. Ajusta si tu sync los renombra.

SELECT
  rs.id            AS response_id,
  co.name          AS company_name,
  loc.name         AS location_name,
  rs.source        AS source,
  rs.createdAt     AS responded_at,
  v.versionNumber  AS version_number${selectCols.length ? ",\n" + selectCols.join(",\n") : ""}
FROM \${ref("ResponseSet")} rs
JOIN \${ref("QuestionnaireVersion")} v ON v.id = rs.versionId
LEFT JOIN \${ref("Location")} loc ON loc.id = rs.locationId
LEFT JOIN \${ref("Company")} co  ON co.id = loc.companyId
LEFT JOIN \${ref("Answer")} a    ON a.responseSetId = rs.id
LEFT JOIN \${ref("Question")} q   ON q.id = a.questionId
WHERE v.questionnaireId = '${input.questionnaireId}'
GROUP BY 1, 2, 3, 4, 5, 6
`;

  return { fileName: `definitions/${tableName}.sqlx`, content };
}
