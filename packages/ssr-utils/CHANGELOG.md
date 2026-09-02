# @real-router/ssr-utils

## 0.2.2

### Patch Changes

- [#2076](https://github.com/greydragon888/real-router/pull/2076) [`5a672d3`](https://github.com/greydragon888/real-router/commit/5a672d314016f9f88e4ccb8f548f9b757dd998f2) Thanks [@greydragon888](https://github.com/greydragon888)! - `serializeRouterState` builds its filtered record through a captured `Object.create` ([#2072](https://github.com/greydragon888/real-router/issues/2072))

  The prototype-less record that stops a filtered context key from being dropped by
  the prototype chain was built through the live intrinsic.

  ⚠ Capture narrows the window from "any time after boot" to "before this module
  loads"; a shim evaluated ahead of the router still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)). It is robustness
  against polyfills, instrumentation, extensions and test doubles, not a security
  boundary.

## 0.2.1

### Patch Changes

- [#1995](https://github.com/greydragon888/real-router/pull/1995) [`b202851`](https://github.com/greydragon888/real-router/commit/b202851411afb5a66af5db36d67086e5d628d195) Thanks [@greydragon888](https://github.com/greydragon888)! - Deciding intrinsics are read from a module-load capture ([#1971](https://github.com/greydragon888/real-router/issues/1971))

  4 reads of `Object.keys` / `hasOwn` / `entries` / `values` /
  `getPrototypeOf` in this package went to the live global, where an application
  can re-point them after boot. They are now read once at module load — the
  doctrine `@real-router/core`'s `guards.ts` states, extended across the repository
  by the sweep in [#1971](https://github.com/greydragon888/real-router/issues/1971).

  Two different consequences, one per file. In `serializeRouterState` the read
  builds the hydration payload, so an empty answer ships a payload missing fields
  the client expects. In `getStaticPaths` the reads are the LOST-KEY detector — it
  round-trips each entry through `matchPath` and reports a supplied key that did
  not survive — so a re-pointed `entries` or `keys` does not drop a path: it makes
  the detector go silent, and a manifest quietly missing pages ships without the
  warning that exists to catch it. That is this issue's own failure mode, in a
  guard.

  ⚠ **What capture does NOT buy**, stated because the doctrine states it: it
  narrows the window from "any time after boot" to "before the module loads". A
  shim evaluated ahead of the module still wins ([#1798](https://github.com/greydragon888/real-router/issues/1798)).
  This is robustness against polyfills, RUM/APM instrumentation, browser extensions
  and test doubles — not a security boundary, since re-pointing `Object.keys`
  already requires script execution.

  No behaviour change in a healthy environment: an intrinsic nobody touched answers
  the same either way.

## 0.2.0

### Minor Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - Give `getStaticPaths` entries two channels, and refuse a key that cannot reach the URL ([#1580](https://github.com/greydragon888/real-router/issues/1580))

  `StaticPathEntries` was single-bag by construction, and every bag went to the
  PATH channel. Since `buildPath` stopped printing a query string out of the params
  bag (nav-pipeline Phase 2, [#1548](https://github.com/greydragon888/real-router/issues/1548)), any entry set that varied a QUERY param
  produced the same URL for every variant — the SSG manifest silently lost pages:

  ```ts
  // Route: /list?sort&page
  entries = { list: async () => [{ sort: "asc" }, { sort: "desc" }] };
  await getStaticPaths(router, entries);
  // before this fix: ["/list", "/list"]   ← two entries, one page
  ```

  **An entry now names its channels** — `{ params?, search? }`, both optional:

  ```ts
  entries = {
    list: async () => [
      { search: { sort: "asc", page: "1" } },
      { search: { sort: "desc", page: "1" } },
    ],
    doc: async () => [{ params: { id: "a" }, search: { rev: "1" } }],
  };
  ```

  Breaking for anyone on the flat form: wrap it in `params`
  (`{ id: "1" }` → `{ params: { id: "1" } }`). There is deliberately no
  single-bag alternative — which channel a key belongs to is the caller's contract
  everywhere else in the router (`navigate` throws on a declared query name handed
  in the path bag), a flat bag cannot express it, and keeping it would have kept
  the shape that caused the bug.

  **And a key that does not reach the URL now fails the build** rather than
  collapsing pages, because the type cannot catch every case — the wrong channel
  (`{ params: { sort } }` for a `?sort`) and a key the route declares nowhere (the
  mode gate drops it under `default` / `strict`) both still type-check:

  ```
  [getStaticPaths] Route "list" built "/list", which does not carry `sort`.
  Every entry differing only in that key generates the same page, so the manifest
  silently loses the rest. …
  ```

  The check asks the URL, not the route's declarations, and that is load-bearing:
  the registry deciding a key's channel is the one that PRINTS ([#1556](https://github.com/greydragon888/real-router/issues/1556)), so
  re-deriving it here would drift from it. Reading `paramMeta.queryParams` off the
  leaf node was measured wrong three ways — it reports the `/items/:id?id`
  collision as a query name (core excludes it, [#843](https://github.com/greydragon888/real-router/issues/843)/[#1549](https://github.com/greydragon888/real-router/issues/1549)) and it sees neither an
  ancestor's `?q` nor a `setRootPath("?lang")` declaration. Matching the built URL
  back sees all three and adapts to `queryParamsMode` for free. It compares
  PRESENCE, not values, so a route's `encodeParams` may still rewrite a value on
  the way out. Cost is ~0.5 µs per entry — 5 ms per 10 000 pages, on a build step —
  and entries that supply nothing skip it entirely.

### Patch Changes

- [#1587](https://github.com/greydragon888/real-router/pull/1587) [`cb6b507`](https://github.com/greydragon888/real-router/commit/cb6b507bcd93c6ba2736ae8ac0aa17090b247507) Thanks [@greydragon888](https://github.com/greydragon888)! - `serializeRouterState` now includes `state.search` ([#1548](https://github.com/greydragon888/real-router/issues/1548))

  Under RFC-4 M2 the query channel lives in `state.search`, separate from
  `state.params`. `serializeRouterState`'s payload still only carried
  `{ name, params, path, context }` — the `search` field was silently dropped
  from the SSR → client transport, even though `SerializedRouterState`
  (`Omit<State, "transition">`) already typed it as present. A consumer reading
  `window.__SSR_STATE__.search` on the client got `undefined` for every query
  value. The payload now includes `search`, matching the type it was already
  declared to have.

## 0.1.0

### Minor Changes

- [#1544](https://github.com/greydragon888/real-router/pull/1544) [`22e7d44`](https://github.com/greydragon888/real-router/commit/22e7d4441fbf5f70c55f50a8ab08615991a4d427) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/ssr-utils` package — SSR/SSG/hydration helpers extracted from core ([#1543](https://github.com/greydragon888/real-router/issues/1543))

  New standalone package hosting the router-level SSR primitives previously
  exposed via the `@real-router/core/utils` subpath: `serializeState`,
  `serializeRouterState`, `hydrateRouter`, `getStaticPaths`, and
  `createRequestScope`. Isomorphic (server + client), depends on
  `@real-router/core` as a peer.

  **Migration:**

  ```diff
  - import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";
  + import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
  ```

  `SerializedRouterState` is now defined in `@real-router/core/types` (core owns
  the shape of its own hydration scratchpad) and re-exported from
  `@real-router/ssr-utils` for backward-compatible imports.
