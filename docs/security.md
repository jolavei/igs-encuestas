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
  secreta: solo `NEXT_PUBLIC_ENABLE_DEV_LOGIN`).
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

## Otras protecciones ya presentes

- **RBAC**: rol resuelto server-side en cada request; rutas protegidas por middleware.
- **Lista blanca de acceso**: solo entran correos pre-registrados y activos (el resto
  recibe AccessDenied).
- **Auth tables fuera de BigQuery**: `Account`/`Session`/`VerificationToken` no se
  sincronizan (contienen tokens).
- **HTTPS** y cookies seguras gestionadas por Vercel + NextAuth.

## Pendiente / posibles mejoras

- Rate limit global con Upstash (ver arriba) si el volumen lo amerita.
- Captcha en el formulario QR público si aparece spam real.
- Consentimiento y política de retención de datos personales (Ley 19.628).
