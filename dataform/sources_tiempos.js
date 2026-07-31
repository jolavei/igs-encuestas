// definitions/sources_tiempos.js — declara la tabla del histórico de Sheets como
// fuente de Dataform, para poder referenciarla con ref("mediciones_sheets").
// La puebla el script scripts/sync-sheets-tiempos.mjs (carga completa 4x/día).
//
// Copia este archivo a definitions/ de tu repo Dataform (proyecto igs-encuestas).

declare({
  schema: "tiempos_procesos",
  name: "mediciones_sheets",
  description:
    "Histórico de tiempos de procesos desde los Google Forms (Google Sheets) IQQ/CJC/PMC. " +
    "Mismo esquema que encuestas.mediciones_de_tiempos. Lo carga el workflow sync-bigquery.",
});
