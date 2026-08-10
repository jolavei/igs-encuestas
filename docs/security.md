# Seguridad

Resumen de las protecciones implementadas.

## 1. Rate limiting (anti-saturación / anti-spam)

- `src/lib/rateLimit.ts` — limitador por IP (ventana fija, en memoria).
- Aplicado a los endpoints **públicos** del QR (los únicos sin autenticación):
  - `GET /api/public/[token]` — 40 req/min por IP.
  - `POST /api/public/[token]` — 8 envíos/min por IP.
- Excedido → responde **HTTP 429** con cabecera `Retry-After`.

> **Limitación en serverless:** en Vercel la memoria es por-instancia y se reinicia en
> cold start, así que es "mejor esfuerzo". Frena a un atacante contra una instancia
> caliente, pero no es un límite global estricto.
>
> **Upgrade a límite global (opcional):** crear una base **Upstash Redis** (gratis),
> instalar `@upstash/ratelimit @upstash/redis`, y reemplazar la implementación de
> `rateLimit.ts` por el limitador de Upstash usando `UPSTASH_REDIS_REST_URL/TOKEN` como
> variables de entorno. La interfaz (`enforceRateLimit`) queda igual.

## 2. Secretos / API keys

- **Ningún secreto está en el código.** Verificado: las credenciales de Neon y Google no
  aparecen en archivos versionados.
- `.env` está en `.gitignore` (no se sube). `.env.example` es solo plantilla con
  placeholders.
- Producción: las variables viven en **Vercel** (Environment Variables) y los secretos del
  pipeline en **GitHub Actions Secrets** (`GCP_SA_KEY`, etc.).
- Solo se exponen al navegador las variables con prefijo `NEXT_PUBLIC_` (ninguna es
  secreta: solo `NEXT_PUBLIC_ENABLE_DEV_LOGIN`, que alterna si se muestra el login de
  desarrollo en la pantalla de login).
- **Rotación:** si un secreto se filtra (p. ej. se pegó en un chat), regenéralo en el
  proveedor (Neon / Google Cloud) y actualiza la variable en Vercel.

## 3. Inyección SQL

- **Toda** la app accede a la base con **Prisma**, que usa consultas **parametrizadas**
  (no se concatena input de usuario en SQL). No hay `queryRawUnsafe`/`executeRawUnsafe`.
- **Validación de entrada** con **zod** en cada endpoint, con límites de tamaño
  (`submitSchema`: máx. respuestas por envío, longitud de texto, etc.) para rechazar
  payloads abusivos antes de tocar la DB.
- El único SQL directo (script `sync-bigquery.mjs`) usa **parámetros** (`$1,$2,…`) y los
  nombres de tabla/columna vienen del **catálogo** de Postgres (`information_schema`),
  además validados contra `^[A-Za-z_][A-Za-z0-9_]*$`. Sin vector de input de usuario.

## 4. Cabeceras de seguridad HTTP

Definidas en `next.config.mjs` (`headers()`), aplicadas a **todas** las rutas:

- **Siempre** (dev y prod): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`
  (anti-clickjacking, la app no se embebe en iframes), `Referrer-Policy:
  strict-origin-when-cross-origin`, `Permissions-Policy` (cámara/micrófono/geolocalización
  deshabilitados) y `X-DNS-Prefetch-Control`.
- **Solo producción**: `Strict-Transport-Security` (HSTS) y `Content-Security-Policy`.
  Se reservan a prod porque `next dev` (HMR) usa `eval`/inline y HSTS no aplica sobre
  http local.
- La **CSP** es pragmática (sin nonces): `script-src`/`style-src` permiten el inline que
  Next inyecta para hidratar y Tailwind; `connect-src` incluye `storage.googleapis.com`
  porque el navegador sube archivos con un `PUT` directo a la URL firmada. Endurecer a
  nonces (script-src estricto) es una mejora futura que requiere tocar el middleware.

## 5. Idempotencia de respuestas (anti-duplicados)

- Cada envío lleva un `clientSubmissionId` (UUID v4 generado en el cliente,
  `SurveyRunner`). Es **estable** entre reintentos de la misma respuesta y se **renueva**
  al empezar una nueva.
- `ResponseSet.clientSubmissionId` tiene índice **único**. `createResponseSet` devuelve el
  envío existente si el id ya llegó (reintento, doble-tap o reenvío de la **cola offline**)
  y captura la carrera concurrente (`P2002`) para no crear duplicados.
- Importa porque el avance de los planes se cuenta por filas: un duplicado inflaría la meta.

## 6. Integridad referencial (coherencia entre entidades)

Prisma rechaza IDs inexistentes, pero no valida la **coherencia** entre entidades.
`src/lib/refIntegrity.ts` cierra ese hueco en las rutas de escritura (admin):

- **Planes de trabajo** (crear/editar): la empresa y el cuestionario existen y la sede
  elegida **pertenece a la empresa** (antes se podía crear un plan con sede de otra
  empresa). No se exige que el cuestionario esté "asignado" a la empresa: por diseño la
  asociación empresa↔cuestionario nace del propio plan.
- **Documentos y carpetas** (registrar / URL firmada / crear carpeta): la sede pertenece
  a la empresa y la carpeta destino (o padre) es de la **misma empresa y sede**.
- Devuelve `HTTP 400` con un mensaje legible; la UI ya envía datos coherentes, así que
  solo bloquea manipulación directa de la API o estados inconsistentes.

## Otras protecciones ya presentes

- **RBAC**: rol resuelto server-side en cada request; rutas protegidas por middleware.
- **Lista blanca de acceso**: solo entran correos pre-registrados y activos (el resto
  recibe AccessDenied).
- **Login dev con doble candado**: el provider `dev` (email sin password) exige el flag
  `ENABLE_DEV_LOGIN` **y** `NODE_ENV !== "production"`, para que una variable mal puesta
  no abra acceso sin contraseña en el sitio real.
- **Protección del último admin**: no se puede degradar de rol ni desactivar al único
  ADMIN activo (evita quedar sin administradores).
- **Auth tables fuera de BigQuery**: `Account`/`Session`/`VerificationToken` no se
  sincronizan (contienen tokens).
- **HTTPS** y cookies seguras gestionadas por Vercel + NextAuth.

## Pendiente / posibles mejoras

- Rate limit global con Upstash (ver arriba) si el volumen lo amerita; extenderlo a
  endpoints autenticados caros (p. ej. dashboard de tiempos → BigQuery).
- Captcha en el formulario QR público si aparece spam real.
- Consentimiento y política de retención de datos personales (Ley 19.628).
- CSP con nonces (script-src estricto, sin `unsafe-inline`).
