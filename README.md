# IGS Encuestas — Plataforma CSAT / NPS

Plataforma a medida para levantar, almacenar y **comparar** CSAT/NPS entre hoteles (y
aeropuertos, clínicas, etc.) de forma estandarizada. El valor está en la
**comparabilidad cruzada** entre propiedades en el tiempo, con trazabilidad de quién
levantó qué dato y bajo qué versión de cuestionario.

## Stack

- **Next.js 14** (App Router) + TypeScript + Tailwind
- **NextAuth** (Google OAuth + login dev por email) — rol resuelto **server-side**
- **PostgreSQL** + **Prisma** (fuente de verdad operacional)
- **BigQuery** como destino analítico (sync batch — ver [docs/bigquery.md](docs/bigquery.md))
- **PWA** con cola offline para levantamiento en campo
- QR con `qrcode`

## Requisitos previos

1. **Node.js 18+** y npm — *no está instalado en esta máquina*. Instálalo desde
   <https://nodejs.org> (LTS).
2. **Docker** (para Postgres local) o una URL de Postgres (Supabase / Railway).

## Puesta en marcha (local)

La base es **PostgreSQL**. `DATABASE_URL` en `.env` apunta al Postgres local
(base `igs_encuestas`, usuario `igs`). Para otro servidor (Supabase/Railway/Neon) solo
cambia esa URL.

```bash
# 1. Variables de entorno
cp .env.example .env        # ajusta DATABASE_URL, NEXTAUTH_SECRET y (opcional) Google OAuth

# 2. Dependencias
npm install

# 3. Esquema + datos de ejemplo
npm run db:push
npm run db:seed

# 4. App
npm run dev                 # http://localhost:3000
```

> Crear base y usuario en un Postgres nuevo:
> ```sql
> CREATE ROLE igs LOGIN PASSWORD 'tu_password';
> CREATE DATABASE igs_encuestas OWNER igs;
> ```
> Alternativa sin servidor (prueba rápida): provider `sqlite` + `DATABASE_URL="file:./dev.db"`.

## Login

- **Producción:** botón "Entrar con Google" (configura `GOOGLE_CLIENT_ID/SECRET`).
- **Desarrollo:** `ENABLE_DEV_LOGIN=true` habilita login solo con email (sin password).
  - `jolave@aerodromosigs.cl` → ADMIN (bootstrap)
  - `encuestador@demo.cl` → SURVEYOR
  - `cliente@demo.cl` → CLIENT (ligado a la empresa demo)

El seed imprime las URLs `/s/<token>` de cada QR para probar el flujo público.

## Roles (RBAC)

| Rol | Ruta | Puede |
|---|---|---|
| ADMIN | `/admin` | cuestionarios+versiones, usuarios/roles, asignaciones, empresas, QR, ver todo |
| SURVEYOR | `/encuestador` | su plan de trabajo, levantar (online/offline), ver pendientes vs cuota |
| CLIENT | `/cliente` | dashboard de su empresa, NPS/CSAT por sede |

Las rutas están protegidas por `src/middleware.ts`; el rol viene del JWT (nunca del cliente).

## Decisiones de diseño clave

- **Versionado:** editar un cuestionario crea **una nueva versión** (snapshot inmutable).
  Las respuestas quedan ligadas a la versión con que se capturaron, nunca al "actual".
- **Formato largo:** `Answer` = una fila por respuesta a una pregunta → cambiar el
  cuestionario no altera el esquema de la tabla.
- **QR estable:** el token apunta a la **sede + cuestionario** y resuelve la versión
  ACTIVE en runtime → un QR impreso no caduca al publicar una versión nueva.
- **`equivalenceKey`** por pregunta → comparar series de tiempo entre versiones.
- **Auditoría:** `AuditLog` registra quién creó/publicó versiones y quién asignó cuotas.

## Estructura

```
prisma/schema.prisma     modelo de datos (entidades del brief)
prisma/seed.ts           empresa, usuarios, cuestionario v1, QR, respuestas demo
src/lib/                 prisma, auth, rbac, validación, métricas, responses, audit
src/middleware.ts        protección de rutas por rol
src/app/api/             CRUD operacional + flujo público QR
src/app/admin|encuestador|cliente   paneles por rol
src/app/s/[token]        encuesta pública vía QR (sin login)
src/components/          builder, survey runner (offline), QR, formularios
docs/bigquery.md         sync batch + esquema analítico + métricas
```

## Pendiente / siguientes fases

- Sync real Postgres→BigQuery (Datastream/Airbyte) + dashboards Looker embebidos (V1.1).
- Módulo ACI-ASQ (carga anual, baja complejidad) — después del MVP.
- Anti-spam en el QR público (rate-limit / captcha) y consentimiento de datos (Ley 19.628).
- Marcar versiones DRAFT → publicar desde la UI de versiones (hoy se publica al crear).
```
