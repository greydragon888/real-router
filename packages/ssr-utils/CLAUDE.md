# @real-router/ssr-utils

Router-level SSR/SSG/hydration helpers. **Published** to npm — extracted from
the SSR-era `@real-router/core/utils` subpath (#1543) to keep core a pure
router with zero SSR-specific surface. ⚠ That specifier is live again and holds
core's ingestion primitives (`putField` / `copyFields`, #1852) — a different
subpath under a reused name. Nothing SSR-related lives there and this package
does not import it. Isomorphic: `serializeState` /
`serializeRouterState` run on the server, `hydrateRouter` on the client,
`getStaticPaths` / `createRequestScope` are server-only in practice but carry
no platform-specific imports.

**Not** consumed by `@real-router/core` itself — the dependency runs one way
(`ssr-utils` → `core`, via `@real-router/core/api` and `/types`).
Consumed by `@real-router/angular` (`provideRealRouterFactory`), and by
`@real-router/ssr-data-plugin` / `@real-router/rsc-server-plugin` at runtime:
their `shared/ssr/createSsrLoaderPlugin.ts` reads the hydration scratchpad
through `getHydrationState`, so both declare this package as a `dependency`.

**Sibling, not merged, with `shared/ssr`.** `shared/ssr` (`createSsrLoaderPlugin`)
is plugin-level scaffolding _inlined_ into `ssr-data-plugin` / `rsc-server-plugin`
via symlink — unpublished, per-plugin tree-shaken. `ssr-utils` is router-level
and published standalone. Different layers, different delivery mechanisms —
see issue #1543 for the design decision.

## Exports

| Export                                                                     | Kind     | Description                                                                                                                                                                 |
| -------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `serializeState(data, opts?)`                                              | function | XSS-safe JSON serialization for embedding in HTML `<script>` tags — escapes `<`/`>`/`&` to `\u00XX`                                                                         |
| `serializeRouterState(state, opts?)`                                       | function | XSS-safe `State` serializer — strips `transition`, keeps `context`; `excludeContext` filters non-JSON namespaces, `serialize` plugs a custom serializer (devalue/superjson) |
| `hydrateRouter(router, source, opts?)`                                     | function | Drives `router.start(parsed.path)` with a one-shot hydration scratchpad this package owns, so SSR loader plugins skip the post-hydration re-run                              |
| `getHydrationState(router)`                                                | function | What the in-flight `hydrateRouter` call deposited for `router`, or `null` — the scratchpad's only exported door, and it reads                                              |
| `getStaticPaths(router, entries?)`                                         | function | Enumerates leaf routes and builds URLs for SSG pre-rendering; throws on an entry key that cannot reach the URL, and on an enumerated forwarding leaf whose target the manifest lacks                                                              |
| `createRequestScope(request, base, deps?)`                                 | function | Per-request SSR isolation — clones `base`, binds an `AbortSignal` to the request lifetime, exposes `dispose()` (+ an async-disposal member for `await using`)                                    |
| `SerializedRouterState`                                                    | type     | Re-exported from `@real-router/core/types` — parsed shape after `JSON.parse(serializeRouterState(...))`                                                                     |
| `SerializeStateOptions`, `Serialize`                                       | types    | `serializeState` options                                                                                                                                                    |
| `SerializeRouterStateOptions`                                              | type     | `serializeRouterState` options                                                                                                                                              |
| `Deserialize`, `HydrateRouterOptions`                                      | types    | `hydrateRouter` options                                                                                                                                                     |
| `StaticPathEntries`, `StaticPathEntry`                                     | types    | `getStaticPaths` per-route entry map; an entry names its channels — `{ params?, search? }`                                                                                  |
| `IncomingMessageLike`, `RequestLike`, `RequestScopeSource`, `RequestScope` | types    | `createRequestScope` request/return shapes                                                                                                                                  |

## Module Structure

```
src/
├── serializeState.ts        — serializeState (self-contained, no core dependency)
├── serializeRouterState.ts  — serializeRouterState (imports `State` from @real-router/core/types)
├── hydrateRouter.ts         — hydrateRouter (imports getPluginApi from @real-router/core/api)
├── hydrationScratchpad.ts   — the scratchpad WeakMap, getHydrationState and the deposit hydrateRouter uses
├── getStaticPaths.ts        — getStaticPaths (imports getPluginApi from @real-router/core/api, RouteTree from @real-router/core)
├── createRequestScope.ts    — createRequestScope (imports cloneRouter from @real-router/core/api)
└── index.ts                 — public re-exports
```

## Gotchas

- **`SerializedRouterState` lives in core, not here.** The type is defined in `packages/core/src/types/base.ts` — the shape is core's own `State` — and re-exported by this package's `index.ts`. Do not redefine it locally — import from `@real-router/core/types`.
- **All core imports go through public subpaths** (`@real-router/core/api`, `@real-router/core/types`, `@real-router/core`), never relative `../` paths into core's `src/` — this package resolves core the same way any external consumer does.
- **`hydrateRouter`'s scratchpad is single-shot, and it lives here (#2361).** `hydrationScratchpad.ts` keeps a module-private `WeakMap` keyed by router; `hydrateRouter` deposits just before `router.start()` and restores the previous value in `finally`, so only the `start()` it triggers reads a payload. `getHydrationState` is the only exported door and it reads — the package's runtime exports are pinned in `hydrateRouter.test.ts`, so a write door cannot appear unnoticed.
- ⚠ **Writer and reader must resolve ONE copy of this package.** Two copies hold two `WeakMap`s: `hydrateRouter` deposits into one, the SSR loader plugin reads the other, and the loader re-runs on first paint without an error. The two plugins declare this package as a plain `dependency` so a single release line resolves to one copy; the choice over a peer dependency, and when to revisit it, is recorded in `IMPLEMENTATION_NOTES.md` "Hydration scratchpad moves to `ssr-utils`".
- ⚠ **`hydrateRouter` validates the router through `getPluginApi` before depositing.** The scratchpad is keyed by identity and a plugin reads it with the router it was installed on, so a `Proxy` over a router (Vue `reactive()`), a router from another copy of core or a non-router would otherwise hydrate a key nothing reads. The refusal is core's own message.
- **`createRequestScope`'s Node vs Web branch is structural, not `instanceof`-based.** `isRequestLike()` duck-types on `"signal" in request` — a Node `IncomingMessage` and a Web `Request` are both accepted without an explicit runtime dependency on either platform's global types.
- **`getStaticPaths` entries are two-channel, and the guard asks the URL — not the declarations (#1580).** An entry is `{ params?, search? }`; there is deliberately no single-bag form, because which channel a key belongs to is the caller's contract everywhere else in the router and a flat bag cannot express it. The check builds the URL, matches it back, and reports any supplied key that did not survive. It must NOT be re-derived from `paramMeta.queryParams` on the leaf node — measured wrong three ways: that reports the `/items/:id?id` collision as a query name (core excludes it, #843/#1549) and sees neither an ancestor's `?q` nor a `setRootPath("?lang")` declaration. Matching the URL back sees all three and adapts to `queryParamsMode` for free. It compares PRESENCE, not values, so a route's `encodeParams` may still rewrite a value on the way out.
- **An enumerated leaf that FORWARDS must land on a URL the manifest produced (#2256).** Since #2250 an href RESOLVES the chain, while this function prints the LITERAL form — the one that answers about the route it was NAMED (INVARIANTS #8). So an entry supplied for a forwarding source writes a file at the SOURCE's URL while every `<Link>` to it names the TARGET's, which nothing produced: a silent 404 on a static host with no build step failing. The check asks `forwardState`, the door `buildHref` asks — not `buildNavigationState`, which resolves the same chain but opts into `reportUndeclaredParamKey`, and enumerating a manifest commits nothing. ⚠ It REPORTS, never emits: leaf-only enumeration is an explicit contract (#608, closed NOT_PLANNED), so inferring a page the author did not enumerate is what that decision refuses. ⚠ Forwarding is decided by BEHAVIOUR (`terminal.name !== routeName`), so a dynamic `forwardTo` is covered, and the trigger is `forwardTo` on an enumerated leaf rather than "the target takes params" — measured, a parameterless source forwarding to a route with CHILDREN lands on a path a leaf-only walk never emits.
- **`getStaticPaths` walks leaves via manual accumulation, not `[...spread]`.** V8 caps spread/apply arguments (~124k on Node 24); accumulating into a shared array avoids `RangeError: Maximum call stack size exceeded` on route trees with that many static leaves.
- **`serializeState`'s XSS escape is content-agnostic** — it scans the whole serialized string for `<`/`>`/`&`, including inside `state.context` namespace values, not just top-level fields.
- **`createRequestScope` resolves its disposal key per call, and that key is always a symbol (#2117).** `Symbol.asyncDispose` reaches Node in 24.0.0, so on Node 22 LTS reading it answers `undefined` — which, as a computed key in an object literal, coerces to the string `"undefined"` and puts a junk member on the returned handle. The fix is not a guard around the write but a key that cannot be a string: the well-known symbol where the host has one, `Symbol.for("Symbol.asyncDispose")` where it does not. esbuild resolves its lowered `await using` the same way — `(symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name)`, verbatim from 0.28.1 — so `await using` now works on Node 22 under an esbuild-based build, pinned by a cell that disposes through the registry key and a control proving a same-description symbol does **not** satisfy it. The read stays per call so a later-loaded polyfill reaches the scopes built after it. ⚠ One toolchain stays out of reach from here whatever the scope carries — the `createRequestScope` docblock names it and says why.
