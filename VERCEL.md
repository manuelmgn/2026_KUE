# Despliegue en Vercel

KUE incluye soporte nativo para **Vercel** (Fluid Compute, PostgreSQL gestionado desde Marketplace, **Vercel Blob** para imágenes y **Vercel Schedules** para la sincronización periódica).

## 1. Importar el proyecto en Vercel

1. Sube o conecta tu repositorio en [Vercel](https://vercel.com) (desde la rama `feat/vercel-deploy` o tras fusionarla en `main`).
2. Vercel leerá `vercel.json` automáticamente:
   - **Fluid Compute** activado (`"fluid": true`), con hasta **300 s** de duración en Hobby para las rutas de sincronización.
   - **Build Command**: `npm run build:vercel` (`scripts/vercel-build.mjs`), que genera el cliente de Prisma para PostgreSQL, ejecuta `prisma migrate deploy` (cuando `DATABASE_URL` apunta a PostgreSQL) y compila Next.js.
   - **Schedule**: `lineup-sync` cada 30 minutos (`*/30 * * * *`) apuntando a la función privada `api/schedules/lineup-sync` (`@vercel/schedules`).

## 2. Añadir base de datos PostgreSQL (Marketplace)

Desde la CLI (`vercel install`) o el dashboard (**Storage / Marketplace**):

- **Opción recomendada para Prisma**: **Prisma Postgres** (`vercel install prisma`, plan gratuito sin tarjeta).
  - Crea automáticamente `DATABASE_URL` (conexión directa para migraciones) y `DATABASE_URL_POOLED` (conexión pooled con PgBouncer para runtime).
- **Alternativa**: **Neon** (`vercel install neon`) o **Supabase**.
  - En producción serverless, KUE usa `DATABASE_URL_POOLED ?? DATABASE_URL` con `pg.Pool` + `attachDatabasePool` de `@vercel/functions`, y reserva `DATABASE_URL` para las migraciones en build.

> Si hiciste un primer despliegue antes de enlazar la base de datos, simplemente vuelve a lanzar un _Redeploy_ tras añadir PostgreSQL para que `npm run build:vercel` ejecute `prisma migrate deploy`.

## 3. Añadir almacenamiento de imágenes (Vercel Blob)

En Vercel el sistema de archivos es efímero, por lo que KUE usa **Vercel Blob** en cuanto detecta `BLOB_READ_WRITE_TOKEN` o `BLOB_STORE_ID`:

1. Crea un Blob Store **privado** desde el dashboard (**Storage → Create Database → Blob → Private**) o con la CLI:

   ```bash
   vercel blob create-store kue-media --access private
   ```

2. Conéctalo al proyecto de Vercel para que inyecte `BLOB_READ_WRITE_TOKEN` (y/o `BLOB_STORE_ID`).
3. Las imágenes se sirven autenticadas a través de `/api/media/[...path]` usando `get(..., { access: 'private' })`.
   - Si ya creaste un Blob Store **público**, añade la variable `BLOB_ACCESS=public`.

## 4. Variables de entorno opcionales

| Variable                | Obligatoria            | Descripción                                                                           |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Sí                     | Cadena directa de PostgreSQL (usada por Prisma en migraciones y fallback en runtime). |
| `DATABASE_URL_POOLED`   | Recomendada            | Cadena pooled de PostgreSQL para runtime en Fluid Compute.                            |
| `BLOB_READ_WRITE_TOKEN` | Sí (o `BLOB_STORE_ID`) | Credencial del store de Vercel Blob.                                                  |
| `BLOB_ACCESS`           | No                     | `"private"` (por defecto) o `"public"`.                                               |
| `ADMIN_USERNAME`        | Opcional               | Usuario administrador inicial (se crea si no hay usuarios en BD).                     |
| `ADMIN_EMAIL`           | Opcional               | Email del administrador inicial.                                                      |
| `ADMIN_PASSWORD`        | Opcional               | Contraseña del administrador inicial (mínimo 8 caracteres).                           |
| `GEMINI_API_KEY`        | Opcional               | Clave de Gemini API para extracción automática de carteles.                           |
| `GEMINI_MODEL`          | Opcional               | Por defecto `gemini-3.5-flash-lite`.                                                  |

## 5. Verificación tras el despliegue

1. Comprueba `GET https://<tu-app>.vercel.app/api/health` → debe devolver `200 OK` con `"database": "connected"`.
2. Revisa la pestaña **Schedules** del proyecto en Vercel: ahí verás `lineup-sync` y podrás probarlo manualmente con **Run Schedule** (o `vercel schedules invoke lineup-sync`).

## Notas sobre arquitectura serverless

- **Sincronización de artistas**: al importar un festival o añadir artistas, `SyncQueue` extiende la vida de la función mediante `waitUntil` (hasta 300 s en Hobby) y se detiene con margen antes del `getDeadline()`. Si quedan artistas `PENDING` o `SYNCING` obsoletos (> 5 min), tanto el polling de `/api/sync` en la interfaz como el Schedule cada 30 min los reanudan automáticamente.
- **Rate limiting de autenticación**: `SlidingWindowRateLimiter` sigue operando en memoria por instancia de Fluid Compute (sin dependencias extra). Si en el futuro necesitas límites globales estrictos entre múltiples instancias concurrentes, puedes sustituirlo por Upstash Redis (`@upstash/ratelimit`).
