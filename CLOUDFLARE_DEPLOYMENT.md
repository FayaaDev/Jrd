# Jrd Cloudflare Deployment

Target architecture:

- Cloudflare Worker serves the React `dist/` assets.
- Worker handles `/api/*` on the same hostname.
- PostgreSQL 17 runs privately on the FayaaLink host.
- Cloudflare Hyperdrive pools Worker connections to Postgres.
- Workers VPC and Cloudflare Tunnel connect Hyperdrive to the private database.

## Current State

The repo now has a Worker static-assets and API runtime:

- `worker/index.ts`
- `wrangler.jsonc`

The Worker supports:

- `GET /api/health`
- `GET /api/deployment-status`
- `GET /api/db-health`
- Better Auth routes under `/api/auth/*`, including Google sign-in
- Portfolio, admin, price snapshot, import/export, FX, and provider proxy routes
- PDF import routes, backed by Mistral/OpenAI secrets
- SPA static asset fallback
- Hyperdrive binding to private PostgreSQL 17

Data migration status:

- The final Supabase `public` schema was copied to database `jrd` on 2026-08-26.
- All 10 tables and 203 rows matched Supabase by exact row count and canonical SHA-256.
- Supabase remains active as the pre-cutover rollback source, but does not receive new Jrd writes.
- Legacy `portfolio_documents` was not copied because the current app code no longer references that table and the initialized Supabase schema does not include it.
- Temporary Worker migration endpoint and `MIGRATION_TOKEN` secret were removed after seeding.

Local tunnel retirement status:

- `jrd.fayaa92.sa` is cut over to the Cloudflare Worker custom domain.
- The Caddy `jrd.fayaa92.sa` block was removed.
- The local `fayafolio-api` container was stopped and removed.
- `/srv/docker/fayafolio-api` was retired to `/srv/docker/fayafolio-api.retired-20260516-002503`.
- `/srv/apps/static/Jrd` was retired to `/srv/apps/static/Jrd.retired-20260516-002503`.
- Final local backup before retirement: `/srv/backups/fayafolio-tunnel-retire-20260516-002342`.

The Worker now replaces the retired Express API for the production custom domain.

## Required Cloudflare Permissions

Wrangler requires a valid local Cloudflare token. The stale token found during the 2026-08-26 cutover was invalid and was removed; the scoped cutover token was deleted after deployment. Create a replacement with:

- Workers Scripts edit
- Workers Routes edit
- Account Hyperdrive edit
- Zone DNS edit if using custom domains/routes

After updating the token, verify:

```bash
npx wrangler whoami
npx wrangler hyperdrive list
```

## Private Postgres And Hyperdrive

PostgreSQL 17 runs as `postgres17` on the private `caddy_default` Docker network. It has no published host port. TLS is enabled at the database, and Workers VPC reaches it through `fayaa92-tunnel`.

Current private connectivity:

- Workers VPC service `jrd-postgres17`: `01a03f16-5205-73d3-9c7f-ca1b138114c3`
- Hyperdrive `jrd-postgres17`: `ed42409af74b4335b94aba87d56652d9`
- Database: `jrd`
- Application role: `jrd_app`
- Hyperdrive caching: disabled

The former Supabase Hyperdrive `jrd-production` (`0b2ddff5a6964170a291c25f0dcc953b`) is retained temporarily for rollback. Do not switch back after new production writes without first reconciling data from PostgreSQL 17.

Health check:

- `https://jrd.fayaa92.sa/api/db-health`

The historical setup notes remain below for reference.

Create or choose a managed Postgres database reachable from Cloudflare, then create Hyperdrive.

### Neon Path

1. Create a Neon project named `jrd-production`.
2. Use the closest practical region to the expected users, or the default region if unsure.
3. Create a database named `fayafolio`.
4. Create an app user with least-privilege credentials for Jrd.
5. Copy the pooled or direct PostgreSQL connection string with SSL required.
6. Store it locally only as `JRD_PRODUCTION_DATABASE_URL` for the Hyperdrive creation command.

### Supabase Path

1. Create a Supabase project named `jrd-production`.
2. Use the closest practical region to the expected users.
3. Use the built-in Postgres database or create a dedicated `fayafolio` database/schema.
4. Create a dedicated app user if using direct Postgres credentials.
5. Copy the direct PostgreSQL connection string with SSL required.
6. Store it locally only as `JRD_PRODUCTION_DATABASE_URL` for the Hyperdrive creation command.

Create Hyperdrive:

```bash
npx wrangler hyperdrive create jrd-production --connection-string "$JRD_PRODUCTION_DATABASE_URL"
```

Copy the returned Hyperdrive `id` into the `hyperdrive` binding in `wrangler.jsonc`.

## Secrets

Set production secrets with Wrangler. Do not commit secrets to source.

Required secrets:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ALPACA_KEY_ID`
- `ALPACA_SECRET_KEY`
- `SAHMK_API_KEY`
- `X_CMC_PRO_API_KEY`
- `MISTRAL_API_KEY`
- `OPENAI_API_KEY`

Non-secret vars:

- `OPENAI_MODEL`
- `SAHMK_BASE_URL`
- `BETTER_AUTH_URL=https://jrd.fayaa92.sa`

## Commands

```bash
npm run build
npm run cf:types
npm run cf:dry-run
npm run cf:deploy
```

The production custom domain is deployed to the Worker and validated against Hyperdrive.

## Cutover Checklist

1. Backup current `fayafolio` Postgres database.
2. Restore/import data into managed Postgres.
3. Create Hyperdrive config.
4. Port API routes from `server/index.js` to Worker handlers. Done.
5. Set Wrangler secrets. Done.
6. Validate auth, portfolio CRUD, admin routes, PDF import, prices, and mobile auth in staging.
7. Add production custom domain route for `jrd.fayaa92.sa`. Done.
8. Keep local Docker API running for rollback. Superseded by final backup and retired service directory.
9. Retire local Docker API after stability window. Done.
