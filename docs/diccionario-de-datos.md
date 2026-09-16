# Diccionario de datos (PostgreSQL — local + Neon)

Referencia de todas las tablas de la base operacional. **Fuente de verdad:**
[`prisma/schema.prisma`](../prisma/schema.prisma) — este documento lo describe en
lenguaje natural; si hay diferencias, manda el `schema.prisma`.

- **Motor:** PostgreSQL. Local (`igs_encuestas`) y producción (**Neon**, vía Vercel).
- **Migraciones:** `prisma/migrations/`. En cada deploy, `vercel-build` corre
  `prisma migrate deploy` y las aplica a Neon.
- **Respuestas en formato largo:** una fila por respuesta a una pregunta (`Answer`).
- **"Enums" portables:** los campos tipo enum se guardan como `String` y se validan en la
  app con zod (el esquema es portable a SQLite si hiciera falta).

Convención de esta guía: 🆕 marca columnas agregadas en el enriquecimiento de
2026-09-15 (migración `20260915000000_enrich_data_model`).

**Resumen:** 23 tablas de modelo + 3 tablas puente (muchos-a-muchos, las crea Prisma) +
`_prisma_migrations`. Dos tablas están vacías a propósito (ver
[Tablas en desuso](#tablas-en-desuso)).

---

## 🔐 Autenticación (NextAuth + roles)

### `User`
Personas con acceso: **ADMIN**, **SURVEYOR** (encuestador) y **CLIENT** (cliente por sede).
El rol se resuelve siempre server-side (callback `jwt`), nunca desde el cliente.

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `id` | String (cuid) | no | PK |
| `name` | String | sí | Nombre del proveedor OAuth (fallback del nombre mostrado) |
| `firstName` | String | sí | Nombre; lo define el admin en "Usuarios y roles" |
| `lastName` | String | sí | Apellidos |
| `email` | String | no | **Único**. Es la llave de la whitelist de acceso |
| `emailVerified` | DateTime | sí | Verificación de email (lo usa el adaptador) |
| `image` | String | sí | Avatar (hoy no se puebla) |
| `role` | String | no | `ADMIN` \| `SURVEYOR` \| `CLIENT`. Default `SURVEYOR` |
| `active` | Boolean | no | `false` = desactivado (no puede entrar). Default `true` |
| `phone`,`address`,`rut`,`birthDate` | String/DateTime | sí | Datos personales opcionales |
| `emergencyName`,`emergencyPhone` | String | sí | Contacto de emergencia |
| `companyId` | String | sí | Empresa principal (compat.: se sincroniza con la 1ª sede asignada) |
| `locationId` | String | sí | Si es CLIENT, sede que puede consultar (documentos) |
| `createdAt` | DateTime | no | Alta |
| 🆕 `lastLoginAt` | DateTime | sí | Último inicio de sesión. Lo marca `events.signIn` (best-effort) |

**Relaciones:** cuentas OAuth (`Account`), planes asignados (`_WorkPlanSurveyors`), respuestas
levantadas, auditoría, ingestas ASQ, y sedes asignadas (`_UserAssignedLocations`).

### `Account`
Vínculo de cada cuenta OAuth externa (Google / Microsoft / Yahoo) a un `User`. La escribe el
adaptador de NextAuth al ligar un proveedor. Columnas: `provider`, `providerAccountId`
(únicos juntos), `type`, y tokens/metadatos OAuth (`access_token`, `refresh_token`,
`id_token`, `scope`, `expires_at`, `token_type`, `session_state`). Borra en cascada con el `User`.

### `Session`
> ⚠️ **Vacía a propósito.** NextAuth usa `session: { strategy: "jwt" }`, así que la sesión
> vive en la cookie firmada y esta tabla nunca se escribe. La mantiene el esquema del
> adaptador. Columnas: `sessionToken` (único), `userId`, `expires`.

### `VerificationToken`
> ⚠️ **Vacía hoy.** Solo la usaría un login por correo (Magic Link / EmailProvider), que hoy
> no está activo. Necesaria únicamente si se activa el Magic Link (Resend). Columnas:
> `identifier`, `token` (único), `expires`.

---

## 🏢 Negocio / clientes

### `Company`
Empresa cliente.

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `id` | String (cuid) | no | PK |
| `name` | String | no | Nombre |
| `kind` | String | no | `hotel` \| `aeropuerto` \| `clinica` \| … |
| `active` | Boolean | no | `false` = cliente pasado (conserva histórico). Default `true` |
| 🆕 `rut` | String | sí | RUT / identificador tributario |
| 🆕 `email` | String | sí | Correo de contacto |
| 🆕 `phone` | String | sí | Teléfono de contacto |
| `createdAt` | DateTime | no | Alta |

### `Location`
Sede de una empresa. A esto se asocian encuestas, QR y documentos.

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `id` | String (cuid) | no | PK |
| `companyId` | String | no | Empresa (cascada) |
| `name` | String | no | Nombre de la sede |
| `city` | String | sí | Ciudad |
| `address` | String | sí | Dirección |
| 🆕 `iataCode` | String | sí | Código IATA del aeropuerto (ej. `PMC`) |
| 🆕 `icaoCode` | String | sí | Código ICAO (ej. `SCTE`) |
| 🆕 `timezone` | String | sí | Zona horaria IANA (ej. `America/Santiago`); desambigua los tiempos |
| `createdAt` | DateTime | no | Alta |

---

## 📋 Cuestionarios (versionado inmutable)

### `Questionnaire`
Contenedor lógico. Se puede asignar a varias empresas (mismo cuestionario → benchmarking
cruzado). Tiene N versiones (snapshots). Columnas: `title`, `active` (no vigente = histórico),
`createdAt`.

### `QuestionnaireVersion`
Snapshot inmutable de un cuestionario. Al pasar a `ACTIVE` ya no se editan sus preguntas: se
crea una versión nueva.

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `id` | String (cuid) | no | PK |
| `questionnaireId` | String | no | Cuestionario (cascada) |
| `versionNumber` | Int | no | Correlativo. Único por `(questionnaireId, versionNumber)` |
| `status` | String | no | `DRAFT` \| `ACTIVE` \| `ARCHIVED`. Default `DRAFT` |
| `publishedAt` | DateTime | sí | Fecha de publicación |
| `createdById` | String | sí | Quién la creó |
| `note` | String | sí | Comentario: qué cambió en esta versión y por qué |
| `createdAt` | DateTime | no | Alta |

### `QuestionSection`
Sección estilo Google Forms dentro de una versión. Columnas: `order`, `title`, `description`,
`routing` (`NEXT` \| `SUBMIT` \| `GOTO:<order>`).

### `Question`
Pregunta de una versión (no del cuestionario abstracto).

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `id` | String (cuid) | no | PK |
| `versionId` | String | no | Versión (cascada) |
| `sectionId` | String | sí | Sección (null en versiones antiguas) |
| `order` | Int | no | Orden |
| `type` | String | no | `LIKERT` \| `NPS` \| `SINGLE_CHOICE` \| `MULTI_CHOICE` \| `TEXT` \| `DATETIME` \| `NUMBER` |
| `text` | String | no | Enunciado |
| `required` | Boolean | no | Obligatoria |
| `config` | String (JSON) | sí | Validación por tipo: `{ min, max, step, maxLength, options, multi }` |
| `equivalenceKey` | String | sí | Compara series de tiempo entre versiones aunque cambie el cuestionario |
| `bqColumnName` | String | sí | Columna destino en la tabla ancha de BigQuery |
| `bqType` | String | sí | Tipo BQ: `STRING`/`INT64`/`FLOAT64`/`NUMERIC`/`BOOL`/`DATE`/`TIMESTAMP` |
| `bqDescription` | String | sí | Detalle del mapeo |

---

## 🎯 Planes de trabajo (metas de levantamiento)

### `WorkPlan`
Meta compartida: empresa + cuestionario + ventana de tiempo. Suman a la meta los
levantamientos de encuestadores asignados y admins (no el QR público).

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `id` | String (cuid) | no | PK |
| `companyId` | String | no | Empresa (cascada) |
| `questionnaireId` | String | no | Cuestionario (cascada) |
| `name` | String | sí | Etiqueta opcional (ej. `SU2026`) para distinguir dos planes del mismo cuestionario |
| `locationId` | String | sí | Sede fija (opcional); si null, la elige el encuestador |
| `windowStart`,`windowEnd` | DateTime | no | Ventana de tiempo |
| `totalTarget` | Int | no | N mínimo total. Default `0` |
| `segmentKey`,`segmentLabel` | String | sí | Segmento primario (nivel 1) y su etiqueta |
| `segment2Key`,`segment2Label` | String | sí | Segmento secundario (nivel 2), opcional |
| `comment` | String | sí | Nota |
| `status` | String | no | `ACTIVE` \| `COMPLETED` \| `CANCELLED`. Default `ACTIVE` |
| `createdById` | String | sí | Quién lo creó |
| `createdAt` | DateTime | no | Alta |

### `WorkPlanSegment`
Submeta por segmento. `parentValue = null` → nivel 1; si no, valor del segmento primario al
que pertenece. Columnas: `value`, `label`, `target`.

---

## 📥 Respuestas (formato largo)

### `ResponseSet`
Un envío de encuesta (un respondente), ligado a la **versión** con que se capturó.

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `id` | String (cuid) | no | PK |
| `versionId` | String | no | Versión respondida |
| `locationId` | String | sí | Sede |
| `source` | String | no | `FIELD` \| `QR_PUBLIC` |
| `surveyorId` | String | sí | Encuestador (null en QR público) |
| `workPlanId` | String | sí | Plan de trabajo |
| `segmentValue` | String | sí | Valor del segmento primario (nivel 1) |
| `segmentValue2` | String | sí | Valor del segmento secundario (nivel 2) |
| 🆕 `startedAt` | DateTime | sí | Inicio de la toma (lo reporta el cliente; ver nota) |
| 🆕 `durationMs` | Int | sí | Duración de la encuesta en ms (lo reporta el cliente; ver nota) |
| 🆕 `userAgent` | String | sí | User-Agent del navegador (capturado server-side) |
| 🆕 `deviceType` | String | sí | `mobile` \| `tablet` \| `desktop` (derivado del User-Agent) |
| `clientSubmissionId` | String | sí | **Único**. UUID del cliente → idempotencia (reintentos / cola offline) |
| `syncedAt` | DateTime | sí | Trazabilidad de sync a BigQuery. `null` = pendiente |
| `createdAt` | DateTime | no | Fecha del envío |

> **Nota tiempos:** `userAgent` y `deviceType` ya se poblan en cada envío.
> `startedAt`/`durationMs` **son columnas listas** pero requieren que el cliente
> (SurveyRunner) mande el cronómetro de la encuesta — encaja con el roadmap de
> automatización de medición de tiempos.

### `Answer`
Formato largo: una fila por respuesta a una pregunta. Un valor según tipo:
`valueNumber` (LIKERT/NPS/NUMBER), `valueText` (TEXT/SINGLE_CHOICE),
`valueDate` (DATETIME), `valueJson` (MULTI_CHOICE → array). Borra en cascada con `ResponseSet`.

### `QrToken`
Token QR **estable** por sede+cuestionario; resuelve la versión `ACTIVE` en runtime para que
un QR ya impreso no se invalide al versionar. Columnas: `token` (único), `active`.

---

## ☁️ Documentos (repositorio tipo Drive)

### `Folder`
Carpeta anidable con alcance empresa + sede opcional. Columnas: `parentId` (árbol,
autorreferencia), `name`, `createdById`.

### `Document`
Archivo. El binario vive en Google Cloud Storage; se descarga con URL firmada.

| Columna | Tipo | Null | Descripción |
|---|---|---|---|
| `id` | String (cuid) | no | PK |
| `companyId` | String | no | Empresa (cascada) |
| `locationId` | String | sí | Sede |
| `folderId` | String | sí | Carpeta |
| `name` | String | no | Nombre visible |
| 🆕 `description` | String | sí | Nota/detalle del archivo |
| `objectPath` | String | no | Ruta del objeto en el bucket de GCS |
| `contentType` | String | no | MIME |
| `size` | Int | no | Tamaño en bytes |
| `uploadedById` | String | sí | Quién lo subió |
| `createdAt` | DateTime | no | Alta |
| 🆕 `updatedAt` | DateTime | no | Última modificación (auto, `@updatedAt`) |
| 🆕 `deletedAt` | DateTime | sí | **Borrado lógico**. `null` = vigente |

> **Borrado lógico:** al borrar, la API elimina el objeto en GCS (libera almacenamiento)
> pero **conserva la fila** con `deletedAt`, preservando el histórico (nombre, quién, cuándo).
> Listados, contadores y descarga filtran `deletedAt = null`. El archivo no es recuperable;
> lo que se conserva es el registro. (El contador `_count.documents` del árbol de carpetas
> aún incluye los borrados: es cosmético y queda como mejora menor.)

---

## 📊 Compliance ASQ (portal ACI-ASQ)

### `AsqComplianceRun`
Un "run" = aeropuerto + temporada, extraído por el scraper (`scripts/scrape-asq.mjs`).
Columnas: `airport`, `season` (`SUMMER`/`WINTER`), `seasonLabel`, `year`, `terminal`,
`surveyType`, `period`, `scrapedAt`. **Único por `(airport, seasonLabel)`** (upsert: solo el
más reciente).

### `AsqComplianceRow`
Detalle por aerolínea-destino de un run. Columnas: `airlineDestination` (`LA-SCL`),
`airlineCode`, `destinationCode`, `target` (plan), `collected` (realizadas). Cascada con el run.

### `AsqAirportMapping`
Asocia cada código de aeropuerto ASQ (PMC, IQQ…) a una empresa+sede, para que
encuestador/cliente vean su ASQ. **PK = `airport`**. Columnas: `companyId`, `locationId`,
`updatedAt`.

### `AsqDepartureImport`
Auditoría de cada ingesta de microdata ASQ Departures (Excel/Sheet) a BigQuery. La microdata
**no** vive en Postgres; aquí solo queda la trazabilidad. Columnas: `fileName`, `objectPath`,
`status` (`LOADED`/`FAILED`), `quarters`, `seasonLabel`, `rowCount`/`ownRowCount`/
`replacedRows`/`loadedRows`, `airportsJson`, `bqTable`, `bqLoadJobId`, `ingestId`, `error`,
`createdById`, `createdAt`.

---

## 🧾 Operación interna

### `SyncLog`
Última sincronización a BigQuery. La escribe el script de sync (SQL directo); el panel admin
muestra la última hora. Columnas: `target` (default `bigquery`), `tables`, `rows`, `syncedAt`.

### `AuditLog`
Auditoría: quién creó/editó versiones, asignó cuotas, subió/borró documentos, etc. Columnas:
`actorId`, `action`, `entity`, `entityId`, `metadata` (JSON texto), `createdAt`.

---

## 🔗 Tablas puente (implícitas, las crea Prisma)

| Tabla | Relación | Para qué |
|---|---|---|
| `_CompanyQuestionnaires` | Company ↔ Questionnaire | Mismo cuestionario en varias empresas (benchmarking) |
| `_WorkPlanSurveyors` | WorkPlan ↔ User | Encuestadores asignados a un plan |
| `_UserAssignedLocations` | User ↔ Location | Sedes que puede ver un usuario |

Además, `_prisma_migrations` (historial de migraciones, la gestiona Prisma).

---

## Tablas en desuso

| Tabla | Estado | Motivo |
|---|---|---|
| `Session` | Siempre vacía | Estrategia de sesión JWT: la sesión vive en la cookie, no en BD |
| `VerificationToken` | Vacía hoy | Solo la usaría el login por correo (Magic Link), hoy inactivo |

No conviene borrarlas del esquema mientras se use `@auth/prisma-adapter` (las declara), y
`VerificationToken` es obligatoria si se activa el Magic Link. Para confirmar conteos reales en
Neon: `SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC;`
