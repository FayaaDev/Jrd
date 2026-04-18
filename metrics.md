# Metrics Dashboard Plan

## Goal

Add metrics collection for the centralized quote hub and expose it through a dedicated `/metrics` route in the app.

The dashboard should answer four questions:

1. How many real upstream quote requests are we making?
2. How much API traffic is centralization avoiding?
3. How fresh are the shared quotes users see?
4. Which provider is failing, slowing down, or degrading coverage?

---

## Product Decision

- Use a dedicated frontend route: `/metrics`
- Keep the page hidden behind the existing admin session model
- Keep the backend metrics endpoint admin-only as well
- Start with in-memory metrics for process lifetime only
- Add persistence later only if trend/history proves useful

This route is operational, not portfolio-facing, so it should not be part of the public browsing flow.

---

## Current Architecture Anchors

- Frontend routes live in `src/router.tsx`
- The shell/navigation live in `src/routes/RootLayout.tsx` and `src/components/NavBar.tsx`
- Admin unlock state lives in `src/contexts/AdminSessionProvider.tsx` and is consumed via `useAdminSession()`
- Admin-authenticated server actions are already handled in `server/index.js`
- Centralized quote fetching now lives in `server/quoteHub.js`
- Client quote reads now flow through `src/hooks/usePrices.ts`

The new metrics system should attach to the quote hub rather than to individual pages or components.

---

## Scope

### Phase 1 Scope

Build these pieces only:

1. In-memory metrics collector in `server/quoteHub.js`
2. Admin-only server endpoint for dashboard payload
3. New frontend route `/metrics`
4. Admin-only metrics page UI
5. Summary cards, provider table, and recent refresh list

### Out Of Scope For Phase 1

- Prometheus export
- Postgres persistence for historical metrics
- alerts/notifications
- market-hours-aware interpretations
- per-symbol drilldowns
- SSE updates for the metrics page

---

## Route And Access Model

### Frontend Route

Add a new route in `src/router.tsx`:

- `path: 'metrics'`
- `element: <Metrics />`

### Access Model

The route should be visible only when admin is unlocked.

Recommended behavior:

- If admin is unlocked, show the metrics page normally
- If admin is not unlocked, render an access-gated empty state with a link to `Settings`
- Do not rely on frontend hiding alone; the server endpoint must require admin auth too

### Navigation

Update `src/components/NavBar.tsx`:

- Add a `Metrics` nav item only when `isUnlocked === true`
- Keep it out of the public nav for read-only visitors

This avoids exposing an operational surface to normal viewers while still making the route first-class for admins.

---

## Backend Plan

## 1. Add Metrics Collection In `server/quoteHub.js`

Create a process-local metrics state next to the existing quote cache.

Suggested structure:

```js
const metrics = {
  startedAt: new Date().toISOString(),
  summary: { ... },
  providers: {
    alpaca: { ... },
    coinmarketcap: { ... },
    sahmk: { ... },
  },
  recentRefreshes: [],
  errors: {},
}
```

Use bounded arrays for recent history, for example:

- keep last `50` refresh cycles
- keep only aggregate counters beyond that

### Instrumentation Points

Instrument these functions:

#### `getPriceSnapshot()`

Track:

- snapshot reads total
- manual refresh requests total
- cache hits total
- cache misses total
- inflight refresh joins total

This is the best place to measure frontend demand versus real refresh work.

#### `refreshQuotes()`

Track:

- total refresh cycles
- scheduled refresh count
- forced refresh count
- total refresh duration
- tracked instrument count
- cached quote count after refresh
- live quote count
- fallback quote count
- missing quote count
- last refresh timestamp
- last successful refresh timestamp

Also append a refresh event into `recentRefreshes` with:

- `startedAt`
- `durationMs`
- `trigger`
- `trackedInstruments`
- per-provider outcome summary

#### `fetchAlpacaQuotes()`
#### `fetchCoinMarketCapQuotes()`
#### `fetchSahmkQuotes()`

Track per provider:

- upstream request count
- requested instrument count
- returned quote count
- success count
- partial success count
- error count
- timeout count
- invalid response count
- last success at
- last error at
- latency totals
- latency p50/p95 inputs via bounded sample buffer or rolling histogram buckets

For Sahmk, partial-failure tracking matters because it fetches symbol-by-symbol.

---

## 2. Metrics To Expose

### Summary Metrics

- `snapshotAgeSec`
- `trackedInstruments`
- `cachedQuotes`
- `liveQuotes`
- `fallbackQuotes`
- `missingQuotes`
- `snapshotReads`
- `manualRefreshes`
- `scheduledRefreshes`
- `cacheHits`
- `cacheMisses`
- `cacheHitRate`
- `inflightRefreshJoins`
- `estimatedRequestsAvoided`
- `estimatedSymbolFetchesAvoided`

### Provider Metrics

Per provider:

- `upstreamRequests`
- `requestedInstruments`
- `returnedQuotes`
- `successCount`
- `partialSuccessCount`
- `errorCount`
- `timeoutCount`
- `invalidResponseCount`
- `successRate`
- `latencyMs.avg`
- `latencyMs.p50`
- `latencyMs.p95`
- `lastSuccessAt`
- `lastErrorAt`
- `currentError`

### Recent Refresh Records

Each row should contain:

- `startedAt`
- `durationMs`
- `trigger` (`scheduled` or `manual`)
- `trackedInstruments`
- `cachedQuotes`
- `providers.alpaca.status`
- `providers.coinmarketcap.status`
- `providers.sahmk.status`
- `providers.*.requested`
- `providers.*.returned`
- `providers.*.durationMs`

---

## 3. Derived Metrics

These should be calculated server-side before returning the payload.

### Cache Hit Rate

```text
cacheHitRate = cacheHits / (cacheHits + cacheMisses)
```

### Provider Success Rate

```text
successRate = successCount / upstreamRequests
```

### Estimated Requests Avoided

Useful approximation:

```text
estimatedRequestsAvoided = snapshotReads - totalUpstreamRequests
```

### Estimated Symbol Fetches Avoided

Better cost approximation:

```text
estimatedSymbolFetchesAvoided = totalQuotesServedToClients - totalRequestedInstrumentsUpstream
```

### Snapshot Age

```text
snapshotAgeSec = now - lastUpdatedAt
```

---

## 4. Backend Endpoint

Add a new admin-only endpoint in `server/index.js`:

- `GET /api/admin/quote-metrics`

This should use the existing `requireAdmin` middleware.

Suggested response shape:

```json
{
  "generatedAt": "2026-04-18T09:00:00.000Z",
  "window": "process-lifetime",
  "summary": {
    "snapshotAgeSec": 11,
    "trackedInstruments": 42,
    "cachedQuotes": 39,
    "liveQuotes": 34,
    "fallbackQuotes": 3,
    "missingQuotes": 5,
    "snapshotReads": 220,
    "manualRefreshes": 4,
    "scheduledRefreshes": 41,
    "cacheHitRate": 0.86,
    "inflightRefreshJoins": 17,
    "estimatedRequestsAvoided": 198,
    "estimatedSymbolFetchesAvoided": 6410
  },
  "providers": {
    "alpaca": {
      "upstreamRequests": 41,
      "requestedInstruments": 410,
      "returnedQuotes": 405,
      "successRate": 0.98,
      "timeoutCount": 0,
      "errorCount": 1,
      "latencyMs": { "avg": 220, "p50": 210, "p95": 480 },
      "lastSuccessAt": "2026-04-18T08:59:45.000Z",
      "lastErrorAt": "2026-04-18T08:44:15.000Z",
      "currentError": null
    },
    "coinmarketcap": {},
    "sahmk": {}
  },
  "recentRefreshes": [],
  "errors": {}
}
```

---

## Frontend Plan

## 1. Create API Client

Add a new file:

- `src/api/metrics.ts`

Responsibilities:

- define Zod schema for the dashboard payload
- export `fetchQuoteMetrics(token)`
- reuse the existing error parsing pattern from `src/api/portfolio.ts`

Because the endpoint is admin-only, the request should include the bearer token from `useAdminSession()`.

---

## 2. Create Route Component

Add a new page:

- `src/routes/Metrics.tsx`

Responsibilities:

- read `token`, `isUnlocked`, and `isChecking` from `useAdminSession()`
- if locked, show access-gated empty state
- if unlocked, fetch metrics using React Query
- poll modestly, e.g. every `10s`
- render the dashboard sections

Recommended query behavior:

- `queryKey: ['quote-metrics']`
- `staleTime: 10_000`
- `refetchInterval: 10_000`
- `refetchIntervalInBackground: true`

Polling every 10 seconds is cheap because the endpoint is local and metrics are already in memory.

---

## 3. Dashboard Layout

Build one page with four blocks.

### Block A: Health Summary Cards

Cards:

- Snapshot age
- Tracked instruments
- Cache hit rate
- Estimated requests avoided

Secondary cards if room allows:

- Live quotes
- Fallback quotes
- Missing quotes
- Manual refresh count

### Block B: Provider Health Table

Columns:

- Provider
- Upstream requests
- Requested instruments
- Returned quotes
- Success rate
- p95 latency
- Last success
- Current error

### Block C: Recent Refreshes

Show last 10-20 refresh cycles.

Columns:

- Started
- Trigger
- Duration
- Tracked instruments
- Alpaca status
- CMC status
- Sahmk status

### Block D: Warnings Panel

Render computed warnings such as:

- snapshot older than `2 * refreshIntervalSec`
- missing quote rate above `10%`
- fallback rate above `20%`
- provider currently erroring
- Sahmk partial failures present in recent refreshes

---

## 4. Route Integration

### `src/router.tsx`

Add:

- import for `Metrics`
- route entry for `/metrics`

### `src/components/NavBar.tsx`

Add a conditional nav item:

- show `Metrics` only when admin is unlocked

This keeps the route available but avoids making it part of the public command surface.

---

## Styling Plan

Reuse the existing visual language from the app.

Use existing building blocks where possible:

- `Card`
- tables
- existing muted/positive/negative text styles
- page intro section pattern already used by `Dashboard`, `Watchlist`, and `Settings`

Add only minimal new CSS in `src/styles/app.css` for:

- metrics card grid
- compact KPI tiles
- provider status badges
- refresh history table tweaks

Do not introduce a separate design system for this page.

---

## Files To Create

- `metrics.md`
- `src/api/metrics.ts`
- `src/routes/Metrics.tsx`

## Files To Modify

- `server/quoteHub.js`
- `server/index.js`
- `src/router.tsx`
- `src/components/NavBar.tsx`
- `src/styles/app.css`

---

## Rollout Order

1. Add in-memory metrics state to `server/quoteHub.js`
2. Instrument refresh lifecycle and provider fetch functions
3. Add `GET /api/admin/quote-metrics` in `server/index.js`
4. Add `src/api/metrics.ts` client and schema
5. Add `src/routes/Metrics.tsx`
6. Register `/metrics` in `src/router.tsx`
7. Add conditional Metrics nav item in `src/components/NavBar.tsx`
8. Add minimal dashboard styling in `src/styles/app.css`
9. Verify locked/unlocked behaviors and metric correctness

---

## Verification Plan

### Backend Verification

1. Load the dashboard route while unlocked and confirm the backend returns metrics
2. Hit `/api/prices/snapshot` several times and confirm snapshot read counters increase
3. Trigger `POST /api/prices/refresh` and confirm manual refresh counters increase
4. Confirm upstream provider counters rise only when real refreshes happen
5. Confirm `inflightRefreshJoins` rises when concurrent reads share one refresh

### Frontend Verification

1. Locked user navigates to `/metrics` and sees access-gated state
2. Unlocked user sees summary cards, provider table, and recent refreshes
3. Metrics update on polling without breaking the rest of the app
4. `Metrics` nav item appears only for unlocked admin sessions

### Correctness Verification

1. Compare provider request counts with temporary logs during manual testing
2. Confirm snapshot age resets after successful refresh
3. Confirm error fields populate when a provider credential is missing or a request fails
4. Confirm missing/fallback/live counts reflect actual dashboard quote coverage

---

## Risks

- Metrics reset on process restart because phase 1 is in-memory only
- Success/error interpretation can be noisy during market closures
- Over-counting can happen if snapshot reads and real refreshes are not separated clearly
- Sahmk partial failures need to remain distinct from total provider failure
- The `/metrics` route must not leak operational details to non-admin users

---

## Future Enhancements

- Persist hourly/daily rollups in Postgres
- Add charts for freshness and provider latency trends
- Add market-hours-aware warnings
- Add provider cost estimation for CoinMarketCap-specific usage
- Add Prometheus-compatible `/metrics` export if external monitoring is needed later
