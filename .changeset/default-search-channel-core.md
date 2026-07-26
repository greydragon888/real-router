---
"@real-router/core": minor
---

RFC-4 M2: `Route.defaultSearch` — explicit query-channel defaults (#1549)

Adds `Route.defaultSearch?: SearchParams` (and `RouteConfigUpdate.defaultSearch`)
as the query-channel twin of `defaultParams`, completing the params/search split
(#1548) for route defaults. `defaultParams` now owns the **path + arbitrary**
channel only, `defaultSearch` owns the **query** channel — the two are
independent and can coexist for a colliding name (`/coll/:id?id` →
`defaultParams.id` fills the path slot, `defaultSearch.id` the query twin).

Core no longer **infers** a default's channel from the route's `?`-declaration.
Defaults route by FIELD: `defaultParams → state.params`, `defaultSearch →
state.search`, in `makeState`, `buildPath`, `forwardState`, the `matchPath` URL
rebuild, and `isActiveRoute`. The inference machinery is removed
(`routeDefaultsByChannel` / `#mergeQueryDefaults` / `getNonQueryDefaultKeys` /
`stripQueryDefaults` / `applySearchWinsForDeclaredQuery` / `splitParamsBySearch`).

**Breaking (pre-1.0, minor):**

- A query-declared default MUST now live in `defaultSearch` to reach
  `state.search` / the URL query cleanly. A query-declared name left in
  `defaultParams` is treated as an arbitrary params-channel default (it lands in
  `state.params`).
- On the v1 single-bag `navigate(name, params)` path, an **undeclared** caller
  key now routes to `state.params` (RFC §2.2 п.5, align-to-RFC), not the URL
  query — pass it via the `search` argument (`navigate(name, params, search)`)
  or declare `?key` to put it in the query.

The `matchPath` URL rebuild also now derives `state.path` from the
forwardState-returned query (`forwardedSearch`), not the raw matched query, so a
recovering/validating `forwardState` interceptor keeps `state.path` in step with
`state.search` (closes the URL/state divergence behind the search-schema
recovery e2e). The rebuild additionally routes a declared `?key` that rides in
the params bag — a plugin's `forwardState` injection (persistent-params on
`start()`), a decoder-injected query key — into the rebuilt URL query, matching
the channel `makeState` commits it to (previously such a key reached
`state.search` but not `state.path` on the initial match).
