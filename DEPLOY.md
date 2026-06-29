# Llevar IGS Encuestas a producción (página web real)

Esta guía te lleva de "corre en mi PC" a "está en internet con su propia URL".

## Cómo encaja todo

```
  Navegador  ─────►  App Next.js (Vercel)  ─────►  PostgreSQL gestionado (Neon)
   (usuarios)            tu-app.vercel.app          datos en la nube, 24/7
                                                          │
                                                          │ sync batch (Datastream)
                                                          ▼
                                                     BigQuery  ◄── Dataform (tablas por cuestionario)
                                                          │
                                                          ▼
                                                   Looker Studio (dashboards)
```

Tres piezas a contratar (todas tienen plan gratis para empezar):
1. **GitHub** — guarda el código.
2. **Neon** (o Supabase/Railway) — la base de datos PostgreSQL en la nube.
3. **Vercel** — hospeda la app Next.js.

Y opcional, para analítica: **Google Cloud** (BigQuery + Dataform + Datastream).

---

## Paso 1 — Subir el código a GitHub

Ya dejé el repo Git inicializado y con un primer commit. Falta conectarlo a GitHub:

1. Crea una cuenta en <https://github.com> y un repositorio **privado** (ej. `igs-encuestas`). No agregues README (ya hay uno).
2. En la carpeta del proyecto, conecta y sube:
   ```bash
   git remote add origin https://github.com/TU_USUARIO/igs-encuestas.git
   git branch -M main
   git push -u origin main
   ```
   Te pedirá login de GitHub (usa un Personal Access Token como contraseña).

> **Importante:** el archivo `.env` está en `.gitignore` — tus contraseñas NO se suben. Eso es correcto; las configuras aparte en Vercel (Paso 3).
>
> **Sobre OneDrive:** el proyecto está dentro de OneDrive, lo que puede dar problemas al compilar localmente. Para producción no importa (Vercel compila en sus servidores), pero si quieres compilar local, mueve la carpeta fuera de OneDrive (ej. `C:\proyectos\igs-encuestas`).

---

## Paso 2 — Base de datos PostgreSQL en la nube (Neon)

1. Crea cuenta en <https://neon.tech> → **New Project** → región más cercana (ej. AWS São Paulo).
2. Copia el **connection string** que te da. Se ve así:
   ```
   postgresql://usuario:password@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require
   ```
3. Guárdalo — es tu `DATABASE_URL` de producción (lo usarás en el Paso 3).

No tienes que crear tablas a mano: las migraciones de Prisma las crean solas en el deploy.

> Alternativas equivalentes: **Supabase** (<https://supabase.com>) o **Railway** (<https://railway.app>). Cualquiera te da un connection string de Postgres.

---

## Paso 3 — Desplegar la app en Vercel

1. Crea cuenta en <https://vercel.com> con tu GitHub.
2. **Add New → Project** → importa el repo `igs-encuestas`. Vercel detecta Next.js solo.
3. Antes de "Deploy", abre **Environment Variables** y agrega (Production):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | el connection string de Neon (Paso 2) |
   | `NEXTAUTH_URL` | `https://TU-APP.vercel.app` (la URL que te dé Vercel) |
   | `NEXTAUTH_SECRET` | un secreto largo aleatorio (genéralo: ver abajo) |
   | `GOOGLE_CLIENT_ID` | del Paso 4 |
   | `GOOGLE_CLIENT_SECRET` | del Paso 4 |
   | `BOOTSTRAP_ADMIN_EMAIL` | `jolave@aerodromosigs.cl` (tu correo = primer admin) |

   **No agregues** `ENABLE_DEV_LOGIN` ni `NEXT_PUBLIC_ENABLE_DEV_LOGIN` en producción → así el login solo-correo queda deshabilitado y solo entra por Google.

   Generar `NEXTAUTH_SECRET` (en tu terminal Git Bash):
   ```bash
   openssl rand -base64 32
   ```

4. **Deploy.** Vercel ejecuta automáticamente `vercel-build` (genera Prisma, aplica migraciones en Neon, compila). En 1-2 min tendrás `https://TU-APP.vercel.app`.

> El primer deploy crea todas las tablas en Neon vía `prisma migrate deploy`. Si cambias el esquema después, genera una migración (`npx prisma migrate dev --name loquesea`), súbela a GitHub, y Vercel la aplica sola en el siguiente deploy.

---

## Paso 4 — Login con Google (OAuth)

1. Entra a <https://console.cloud.google.com> → crea un proyecto (ej. "IGS Encuestas").
2. **APIs y servicios → Pantalla de consentimiento OAuth** → tipo "Externo" → completa nombre y correo.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth** → tipo "Aplicación web".
   - **Orígenes autorizados de JavaScript:** `https://TU-APP.vercel.app`
   - **URIs de redirección autorizados:** `https://TU-APP.vercel.app/api/auth/callback/google`
4. Copia el **Client ID** y **Client Secret** → pégalos en las env vars de Vercel (Paso 3) → vuelve a desplegar (Deployments → Redeploy).

Ahora entras a `https://TU-APP.vercel.app`, botón "Entrar con Google". Tu correo (`BOOTSTRAP_ADMIN_EMAIL`) entra como **ADMIN** automáticamente; desde ahí agregas y das rol al resto en **Usuarios y roles**.

---

## Paso 5 — (Opcional) Dominio propio

En Vercel: **Settings → Domains** → agrega tu dominio (ej. `encuestas.aerodromosigs.cl`). Vercel te indica el registro DNS (un CNAME) que debes crear donde tengas el dominio. Luego actualiza `NEXTAUTH_URL` y los orígenes de Google OAuth a ese dominio.

---

## Paso 6 — Datos demo vs. datos reales

El proyecto trae datos de ejemplo (Hotel Costa Azul, etc.) que solo existen en tu base local. En producción (Neon) la base arranca **vacía** — eso es lo correcto. Creas tus empresas, sedes y cuestionarios reales desde el panel de admin.

Si por alguna razón quisieras cargar los datos demo en producción (no recomendado), correrías el seed apuntando `DATABASE_URL` a Neon. Normalmente **no** lo hagas.

---

## Paso 7 — BigQuery + Dataform (analítica) — ver también `docs/bigquery.md`

Esto se monta **después** de tener la base en la nube (Paso 2), porque Datastream necesita un Postgres accesible desde internet (Neon lo es; tu PC no).

1. **Google Cloud:** activa las APIs de **BigQuery**, **Datastream** y **Dataform**.
2. **Datastream:** crea un *stream* con origen = tu Postgres de Neon (host, usuario, contraseña; habilita la replicación lógica que Datastream pide) y destino = BigQuery (dataset `raw_postgres`). Esto copia y mantiene al día tus tablas operacionales en BigQuery.
3. **Dataform:** crea un repositorio Dataform. Por cada cuestionario, en el panel **"Tabla en BigQuery (Dataform)"** de la app, genera el `.sqlx` y commitéalo al repo (más el `sources.js` una sola vez). Dataform materializa una tabla ancha por cuestionario en el dataset `encuestas`.
4. **Looker Studio:** conecta a las tablas de `encuestas` para los dashboards (NPS/CSAT por empresa y sede).

> Alternativa más simple si Datastream te resulta complejo al inicio: **Airbyte** o **Fivetran** (conector Postgres→BigQuery administrado). El resto (Dataform + Looker) es igual.

---

## Referencia rápida de variables de entorno

| Variable | Local (`.env`) | Producción (Vercel) |
|---|---|---|
| `DATABASE_URL` | Postgres local | connection string de Neon |
| `NEXTAUTH_URL` | `http://localhost:3000` | `https://TU-APP.vercel.app` |
| `NEXTAUTH_SECRET` | cualquiera | secreto aleatorio fuerte |
| `GOOGLE_CLIENT_ID` / `_SECRET` | opcional | obligatorio |
| `BOOTSTRAP_ADMIN_EMAIL` | tu correo | tu correo |
| `ENABLE_DEV_LOGIN` / `NEXT_PUBLIC_ENABLE_DEV_LOGIN` | `"true"` | **omitir** |

---

## Orden recomendado

1. GitHub (Paso 1) → 2. Neon (Paso 2) → 3. Vercel sin Google todavía, usando solo `DATABASE_URL`+`NEXTAUTH_*` para que compile → 4. Google OAuth (Paso 4) y redeploy → 5. ya tienes la web funcionando → 6. más adelante, BigQuery (Paso 7).
