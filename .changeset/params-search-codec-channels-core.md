---
"@real-router/core": minor
---

RFC-4 M2: two-channel `encodeParams` / `decodeParams` — codecs see both the path and query channels (#1548)

Per-route codecs move from the params-only signature to a two-channel one, so a
codec can read and reshape the query channel as well as the path channel. This
restores v1's reach: v1 ran the whole (path + query) bag through both callbacks,
which the M2 params-only interim had silently narrowed to path-only.

**Breaking (pre-1.0):**

- `Route.encodeParams` / `Route.decodeParams` (and their `RouteConfigUpdate`
  twins) change from `(params) => params` to
  `({ params, search }) => ({ params, search })`. The callback now receives one
  argument `{ params, search }` and must return `{ params, search }` — transform
  whichever channel you own and **pass the other through explicitly**.
- New `ParamsSearch` type exported from `@real-router/core` (and `/types`) for
  typing these callbacks.

**Migration:**

```ts
// before (params-only)
decodeParams: (params) => ({ ...params, id: Number(params.id) }),
encodeParams: ({ one, two }) => ({ param1: one, param2: two }),

// after (two-channel) — wrap the old result in `params`, return `search` as-is
decodeParams: ({ params, search }) => ({
  params: { ...params, id: Number(params.id) },
  search,
}),
encodeParams: ({ params: { one, two }, search }) => ({
  params: { param1: one, param2: two },
  search,
}),
```

A codec that only touches path params returns `search` unchanged (the common
case). A query-aware codec may now reshape `search` too — the returned `search`
lands in `state.search` (on decode) and the built query string (on encode).

**Order / semantics:** `decodeParams` runs inside `matchPath` (the engine),
**before** any search-schema plugin validation on the `forwardState` seam
(engine → plugin, the v1 order). On the write path (`buildPath` / `navigate`) the
encoder's returned `params` fills the path slots and its returned `search` builds
the query string. A nullish return from a user codec falls back to the input
channels (unchanged from v1's `?? params` leniency). The `matchPath` URL rebuild
still folds the encoded query into a single bag (an explicit two-channel rebuild
there awaits the `defaultParams` field-split, a later milestone) — the committed
`state.params` / `state.search` split is exact.
