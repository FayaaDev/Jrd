# Unified Fayafolio Plan

## Goal

Collapse Fayafolio into one product, one SPA build, and one API deployment.

The new product model is:

- public self-signup from day one
- Google OAuth only in V1
- Better Auth as the auth framework
- one private portfolio ledger per user
- no public portfolio URLs
- admin can inspect, create, update, archive, restore, or delete any portfolio
- remove the legacy personal and test portfolio deployments

---

## Locked Product Decisions

- Use `better-auth` for auth and session management
- Use Google OAuth only in V1
- Do not use NocoDB as the auth provider
- Do not ship email/password in V1
- Do not require app-level email verification in V1
- Each user gets exactly one portfolio ledger
- User portfolios are always private
- Admin has CRUD control over all portfolio ledgers
- Archive and delete are separate actions
- Keep one app and one API deployment only

These decisions remove the need for public portfolio slugs, `/test` routing, or deployment-time portfolio switching.

---

## Current Architecture Anchors

- Frontend routes live in `src/router.tsx`
- The app shell lives in `src/routes/RootLayout.tsx` and `src/components/NavBar.tsx`
- Admin unlock state lives in `src/contexts/AdminSessionProvider.tsx`
- Client data currently assumes one shared portfolio via `src/api/portfolio.ts` and `src/hooks/usePortfolioSnapshot.ts`
- The backend currently serves one portfolio per process via `PORTFOLIO_SLUG` in `server/store.js`
- Quote caching currently assumes one portfolio per process in `server/quoteHub.js`
- The live duplicate deployment is outside the repo:
  - static: `/srv/apps/static/fayafolio` and `/srv/apps/static/fayafolio-test`
  - docker: `/srv/docker/fayafolio-api` and `/srv/docker/fayafolio-test-api`
  - proxy rules: `/srv/docker/caddy/Caddyfile`

The hidden useful foundation is that the database is already JSONB-backed and portfolio-oriented. The main thing that must change is portfolio identity moving from deployment config to authenticated user ownership.

---

## Target Product Model

### User Experience

1. Anonymous visitor lands on the site and clicks `Continue with Google`
2. Better Auth creates the user record and session
3. The server provisions one blank portfolio ledger for that user
4. The user lands in `/app`
5. The user manages only their own private ledger
6. Admin can view all users and ledgers from `/admin`
7. Admin can archive, restore, delete, or repair any user ledger

### Portfolio Visibility

- No portfolio is public
- No public sharing route exists
- No slug-based browsing exists
- Portfolio access is always session-based

### Admin Meaning Of CRUD

- `Create`: create or recreate a ledger for an existing user, and optionally create a user-plus-ledger operationally later if needed
- `Read`: inspect any user ledger
- `Update`: edit any user ledger contents and metadata
- `Delete`: permanently remove the ledger data

Archive remains separate from delete:

- `Archive`: preserve the ledger but block normal user access and edits
- `Delete`: hard-delete the ledger record and holdings/settings/watchlist data

---

## Target Route Model

### Public Routes

- `/` landing page with one primary CTA: `Continue with Google`
- `/login` optional alias to the same CTA screen

V1 does not need a separate signup page because first-time Google sign-in is the signup flow.

### Auth Routes

- `/api/auth/*` handled by Better Auth

### User App Routes

- `/app`
- `/app/holdings`
- `/app/watchlist`
- `/app/settings`

### Admin Routes

- `/admin`
- `/admin/portfolios`
- `/admin/portfolios/:userId`
- `/admin/users`

---

## Auth Strategy

### Better Auth

Use `better-auth` with:

- PostgreSQL storage
- Google social provider only
- cookie-based sessions
- `role` as an additional user field with values `user | admin`

Recommended user model additions:

- `role` default `user`
- `isDisabled` optional later, not required in V1

### Better Auth Integration Notes

- Mount Better Auth at `/api/auth/*`
- In Express 5, use the Better Auth handler before JSON body parsing for auth routes
- Keep Better Auth cookies same-origin under the Fayafolio host
- Store admin status in the session-backed user record, not in `sessionStorage`

### Google OAuth Only In V1

The public CTA should call Google sign-in through Better Auth.

This keeps V1 smaller by avoiding:

- password reset
- login throttling for passwords
- unverified email workflows
- signup form validation complexity

### Not In Scope For V1

- email/password auth
- magic links
- email verification emails
- account invitations
- NocoDB-backed auth

---

## Authorization Model

### Anonymous Visitor

- Can view landing/auth entry only
- Cannot access portfolio data

### User

- Can access only their own active ledger
- Can edit holdings, watchlist, and settings in their own ledger
- Cannot see any other user or ledger

### Admin

- Can list all users
- Can list all ledgers
- Can inspect any ledger
- Can edit any ledger
- Can archive or restore any ledger
- Can delete any ledger
- Can create or recreate a ledger for an existing user

### Archived User Behavior

If a user's ledger is archived:

- the user can still authenticate
- `/app` shows an archived-state screen
- all ledger mutations are blocked
- admin can restore the ledger later

---

## Data Model

### Recommendation

Replace the deployment-oriented `portfolio_documents` table with a clearer user-owned ledger model.

Recommended new table:

```sql
portfolio_ledgers (
  id uuid primary key,
  owner_user_id text not null unique references "user"(id),
  status text not null check (status in ('active', 'archived')),
  holdings jsonb not null,
  settings jsonb not null,
  watchlist jsonb not null,
  archived_at timestamptz,
  archived_by_user_id text references "user"(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### Why A New Table Instead Of Reusing `portfolio_documents`

- `slug` no longer matters
- one-ledger-per-user should be enforced with `unique owner_user_id`
- the table name should reflect private ledgers, not public portfolio documents
- admin archive state is easier to model directly

### Better Auth Core Tables

Better Auth will manage its own core tables:

- `user`
- `session`
- `account`
- `verification`

### Role Storage

Store `role` on the Better Auth `user` table as an additional field.

### Default Ledger Seed

All new ledgers should be blank.

The seeded personal holdings in `server/defaultPortfolio.js` should be retired from runtime provisioning.

---

## API Plan

### User-Facing API

Replace shared portfolio endpoints with authenticated user endpoints:

- `GET /api/me/portfolio`
- `GET /api/me/portfolio/holdings`
- `GET /api/me/portfolio/watchlist`
- `GET /api/me/portfolio/settings`
- `PUT /api/me/portfolio/settings`
- `POST /api/me/portfolio/holdings`
- `PATCH /api/me/portfolio/holdings/:id`
- `DELETE /api/me/portfolio/holdings/:id`
- `POST /api/me/portfolio/watchlist`
- `DELETE /api/me/portfolio/watchlist/:id`
- `GET /api/me/portfolio/export`
- `POST /api/me/portfolio/import`
- `POST /api/me/portfolio/reset`
- `GET /api/me/prices/snapshot`
- `POST /api/me/prices/refresh`

All of these resolve the target ledger from the authenticated session.

### Admin API

Add admin-only endpoints:

- `GET /api/admin/users`
- `GET /api/admin/portfolios`
- `GET /api/admin/portfolios/:userId`
- `POST /api/admin/portfolios/:userId/create`
- `POST /api/admin/portfolios/:userId/archive`
- `POST /api/admin/portfolios/:userId/restore`
- `DELETE /api/admin/portfolios/:userId`
- `PUT /api/admin/portfolios/:userId/settings`
- `POST /api/admin/portfolios/:userId/holdings`
- `PATCH /api/admin/portfolios/:userId/holdings/:id`
- `DELETE /api/admin/portfolios/:userId/holdings/:id`

Admin read/write should use the same validation rules as normal user mutations.

### API Notes

- Portfolio access must never come from client-supplied user ids on normal user routes
- Admin routes may target `:userId`, but only after role checks
- Old shared endpoints can be removed once the new frontend is switched over

---

## Backend Refactor Plan

### 1. Auth Foundation

Create auth wiring:

- `server/auth.js` or `server/auth/index.js`
- Better Auth config with Google provider
- Better Auth database integration using Postgres
- helper to resolve the current session user on server routes

Update `server/index.js` to:

- mount Better Auth at `/api/auth/*`
- keep auth mount before JSON parsing conflicts
- remove the old `/api/admin/session` token endpoint
- replace bearer-token admin checks with session-plus-role checks

### 2. Store Layer Refactor

Replace `server/store.js` functions that rely on `PORTFOLIO_SLUG` with user-owned ledger functions:

- `getLedgerByUserId(userId)`
- `createBlankLedgerForUser(userId)`
- `updateLedgerByUserId(userId, mutator)`
- `archiveLedgerByUserId(userId, adminUserId)`
- `restoreLedgerByUserId(userId)`
- `deleteLedgerByUserId(userId)`

Remove deployment-time portfolio selection from runtime behavior.

### 3. Quote Hub Refactor

Refactor `server/quoteHub.js` so cache and invalidation are keyed per ledger or `owner_user_id`.

Required changes:

- no process-global assumption of one active portfolio
- refresh and invalidation scoped to the authenticated user's ledger
- admin-inspection flows can load another user's ledger safely

### 4. Default Seed Refactor

Change `server/defaultPortfolio.js` so default provisioning returns an empty ledger.

Optional follow-up:

- rename the file to reflect its new meaning, such as `defaultLedger.js`

---

## Frontend Plan

### 1. Session Model

Remove the current browser token model:

- remove `src/contexts/AdminSessionProvider.tsx`
- remove `src/contexts/adminSession.ts`
- remove `src/hooks/useAdminSession.ts`

Replace with Better Auth client usage:

- `src/lib/auth-client.ts`
- `authClient.useSession()` for React
- route guards based on session presence and `role`

### 2. Routing

Refactor `src/router.tsx` into public, app, and admin surfaces.

Recommended route structure:

- landing route
- authenticated app layout for `/app/*`
- admin layout for `/admin/*`

### 3. Portfolio Queries

Replace current shared query keys:

- from `['portfolio']`
- to user-owned keys such as `['me', 'portfolio']`
- admin inspection keys such as `['admin', 'portfolio', userId]`

### 4. Existing Screens To Reuse

These screens remain useful with ownership-aware data loading:

- `src/routes/Dashboard.tsx`
- `src/routes/Holdings.tsx`
- `src/routes/Watchlist.tsx`
- `src/routes/Settings.tsx`

Required changes:

- remove all `shared portfolio` copy
- remove `unlock editing` copy and controls
- treat authenticated user as the normal editor of their own ledger
- make admin-only actions visible only in admin screens

### 5. Public Entry UX

Create a small public entry screen:

- product value proposition
- `Continue with Google`
- redirect authenticated users to `/app`

V1 should be deliberately minimal here.

---

## Admin UI Plan

### Admin Dashboard

Add `/admin` with:

- total users
- active ledgers count
- archived ledgers count
- missing-ledger count

### Admin Portfolios Page

Add `/admin/portfolios` with:

- search by name or email
- filters for `active` and `archived`
- row actions: view, archive, restore, delete, create/recreate ledger

### Admin Portfolio Detail

Add `/admin/portfolios/:userId`.

This page should let admin:

- inspect the target user's ledger
- edit holdings, watchlist, and settings
- export the ledger
- archive, restore, or delete from the same screen

The simplest implementation is to reuse the same portfolio components with admin-specific data loaders and mutations.

### Admin Users Page

Add `/admin/users` with:

- user list
- role display
- account creation timestamp
- whether the user has a ledger

Role editing can stay out of scope for the first pass if admin seeding happens directly in the database.

---

## Repo Reorganization

### Target Shape

```text
src/
  features/
    auth/
    portfolio/
    admin/
  routes/
    public/
    app/
    admin/
  components/
  lib/
server/
  auth/
  portfolio/
  admin/
  db/
```

### Intent

- organize by product domain instead of deployment variant
- keep one app codebase
- make private-user and admin concerns explicit
- avoid carrying `test` and `shared` as conceptual first-class variants

---

## Infrastructure Plan

### Keep

- one SPA build
- one API container
- one Caddy rule set for Fayafolio

### Remove

- `/srv/apps/static/fayafolio-test`
- `/srv/docker/fayafolio-test-api`
- `/test` SPA routing in `/srv/docker/caddy/Caddyfile`
- `/test/api/*` proxy handling in `/srv/docker/caddy/Caddyfile`

### Simplify

- keep `/srv/docker/fayafolio-api` as the only Fayafolio API compose
- deploy one frontend build to `/srv/apps/static/fayafolio`
- keep one hostname and one auth origin

### Environment Variables To Add

At minimum:

```env
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

The existing `DATABASE_URL` remains the database anchor.

---

## Legacy Data Removal Plan

### 1. Backup First

Before schema changes or route removal:

- export the current `shared` portfolio snapshot
- export the current `test` portfolio snapshot
- save both exports outside runtime tables

### 2. Personal Seed Removal

Remove the current personal seeded holdings from runtime defaults.

If the existing personal data should be kept, store it only as an explicit backup or import artifact, not as a provisioning default.

### 3. Test Portfolio Removal

After new private-ledger flows are live:

- delete the `test` portfolio row/data
- remove `/test` from proxy and static deploy

---

## Implementation Order

1. Back up existing `shared` and `test` data
2. Add Better Auth and Google OAuth server wiring
3. Add Better Auth client wiring in the frontend
4. Add user roles and admin detection
5. Create `portfolio_ledgers` and blank-ledger provisioning
6. Refactor server portfolio access from `PORTFOLIO_SLUG` to authenticated `userId`
7. Refactor quote caching to be ledger-aware
8. Replace admin token checks with session-role checks
9. Refactor frontend routes into landing, app, and admin areas
10. Replace shared query keys with user-owned query keys
11. Remove unlock-editing UI and shared-portfolio copy
12. Build admin list/detail screens
13. Verify archive and delete flows
14. Remove legacy test deployment and `/test` routing
15. Remove old shared/admin token code paths completely

---

## Verification Plan

1. Anonymous user lands on `/` and can only start Google sign-in
2. First-time Google login creates one blank active ledger
3. Returning user login reuses the same ledger
4. Normal user can create, edit, delete holdings only in their own ledger
5. Normal user cannot access admin routes
6. Normal user cannot request another user's ledger via API
7. Admin can list all ledgers and inspect a target user's ledger
8. Admin can archive a user's ledger and the user then sees the archived state in `/app`
9. Admin can restore that ledger and the user regains access
10. Admin can delete a ledger and the user no longer has portfolio data
11. Old `/test` URLs no longer serve a separate app or API
12. No screen in the product refers to a `shared portfolio` or `unlock editing`

---

## Files Likely To Modify

- `package.json`
- `.env.example`
- `server/index.js`
- `server/store.js` or its replacement modules
- `server/quoteHub.js`
- `server/defaultPortfolio.js`
- `server/schemas.js`
- `src/router.tsx`
- `src/App.tsx`
- `src/main.tsx`
- `src/routes/RootLayout.tsx`
- `src/components/NavBar.tsx`
- `src/routes/Dashboard.tsx`
- `src/routes/Holdings.tsx`
- `src/routes/Watchlist.tsx`
- `src/routes/Settings.tsx`
- `src/api/portfolio.ts`
- `src/hooks/usePortfolioSnapshot.ts`
- `src/hooks/usePortfolio.ts`
- `src/hooks/useHoldings.ts`
- `src/hooks/useWatchlist.ts`
- `src/hooks/useSettings.ts`

## Files Likely To Remove

- `src/contexts/AdminSessionProvider.tsx`
- `src/contexts/adminSession.ts`
- `src/hooks/useAdminSession.ts`

## Files Likely To Create

- `server/auth.js` or `server/auth/index.js`
- `server/permissions.js`
- `server/portfolio/` modules
- `server/admin/` modules
- `src/lib/auth-client.ts`
- `src/routes/public/Landing.tsx`
- `src/routes/admin/AdminDashboard.tsx`
- `src/routes/admin/AdminPortfolios.tsx`
- `src/routes/admin/AdminPortfolioDetail.tsx`
- `src/routes/admin/AdminUsers.tsx`

## Infra Files Outside This Repo To Modify

- `/srv/docker/fayafolio-api/docker-compose.yml`
- `/srv/docker/caddy/Caddyfile`

## Infra Files Outside This Repo To Remove

- `/srv/docker/fayafolio-test-api/docker-compose.yml`
- `/srv/apps/static/fayafolio-test`

---

## Out Of Scope For This Unification Pass

- email/password auth
- email verification
- password reset
- public portfolio sharing
- multiple portfolios per user
- custom portfolio domains
- billing or subscriptions
- audit logs
- user invitations
- NocoDB as an identity provider

---

## Success Criteria

The unification is complete when:

- Fayafolio runs as one SPA and one API only
- users self-sign in with Google
- each user owns exactly one private ledger
- admin controls every ledger from `/admin`
- legacy `shared` and `test` deployment behavior is gone
- the codebase no longer models portfolios as deployment-selected shared data
