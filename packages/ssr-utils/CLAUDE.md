# @real-router/ssr-utils

Router-level SSR/SSG/hydration helpers. **Published** to npm — extracted from
the former `@real-router/core/utils` subpath (#1543) to keep core a pure
router with zero SSR-specific surface. Isomorphic: `serializeState` /
`serializeRouterState` run on the server, `hydrateRouter` on the client,
`getStaticPaths` / `createRequestScope` are server-only in practice but carry
no platform-specific imports.

**Not** consumed by `@real-router/core` itself — the dependency runs one way
(`ssr-utils` → `core`, via `@real-router/core/api`, `/validation`, `/types`).
Consumed by `@real-router/angular` (`provideRealRouterFactory`), and by
`@real-router/ssr-data-plugin` / `@real-router/rsc-server-plugin` in tests
only (their `shared/ssr/createSsrLoaderPlugin.ts` source never imports it —
only mentions it in JSDoc prose).

**Sibling, not merged, with `shared/ssr`.** `shared/ssr` (`createSsrLoaderPlugin`)
is plugin-level scaffolding *inlined* into `ssr-data-plugin` / `rsc-server-plugin`
via symlink — unpublished, per-plugin tree-shaken. `ssr-utils` is router-level
and published standalone. Different layers, different delivery mechanisms —
see issue #1543 for the design decision.

## Exports

| Export | Kind | Description |
|--------|------|-------------|
| `serializeState(data, opts?)` | function | XSS-safe JSON serialization for embedding in HTML `<script>` tags — escapes `<`/`>`/`&` to `\u00XX` |
| `serializeRouterState(state, opts?)` | function | XSS-safe `State` serializer — strips `transition`, keeps `context`; `excludeContext` filters non-JSON namespaces, `serialize` plugs a custom serializer (devalue/superjson) |
| `hydrateRouter(router, source, opts?)` | function | Drives `router.start(parsed.path)` with a one-shot hydration scratchpad on `RouterInternals` so SSR loader plugins skip the post-hydration re-run |
| `getStaticPaths(router, entries?)` | function | Enumerates leaf routes and builds URLs for SSG pre-rendering |
| `createRequestScope(request, base, deps?)` | function | Per-request SSR isolation — clones `base`, binds an `AbortSignal` to the request lifetime, exposes `dispose()` (+ `Symbol.asyncDispose`) |
| `SerializedRouterState` | type | Re-exported from `@real-router/core/types` — parsed shape after `JSON.parse(serializeRouterState(...))` |
| `SerializeStateOptions`, `Serialize` | types | `serializeState` options |
| `SerializeRouterStateOptions` | type | `serializeRouterState` options |
| `Deserialize`, `HydrateRouterOptions` | types | `hydrateRouter` options |
| `StaticPathEntries` | type | `getStaticPaths` per-route param-set entries map |
| `IncomingMessageLike`, `RequestLike`, `RequestScopeSource`, `RequestScope` | types | `createRequestScope` request/return shapes |

## Module Structure

```
src/
├── serializeState.ts        — serializeState (self-contained, no core dependency)
├── serializeRouterState.ts  — serializeRouterState (imports `State` from @real-router/core/types)
├── hydrateRouter.ts         — hydrateRouter (imports getInternals from @real-router/core/validation)
├── getStaticPaths.ts        — getStaticPaths (imports getPluginApi from @real-router/core/api, RouteTree from @real-router/core)
├── createRequestScope.ts    — createRequestScope (imports cloneRouter from @real-router/core/api)
└── index.ts                 — public re-exports
```

## Gotchas

- **`SerializedRouterState` lives in core, not here.** The type is defined in `packages/core/src/types/base.ts` (core owns the shape of its own `RouterInternals.hydrationState` scratchpad) and re-exported by this package's `index.ts` for backward-compatible imports (it used to come from `@real-router/core/utils`). Do not redefine it locally — import from `@real-router/core/types`.
- **All core imports go through public subpaths** (`@real-router/core/api`, `@real-router/core/validation`, `@real-router/core/types`, `@real-router/core`), never relative `../` paths into core's `src/` — this package resolves core the same way any external consumer does.
- **`hydrateRouter`'s scratchpad is single-shot.** `RouterInternals.hydrationState` is set just before `router.start()` and cleared in `finally` — only the *first* `start()` triggered by `hydrateRouter` consumes it. See `packages/core/CLAUDE.md` "Hydration scratchpad (#596)" for the full mechanism (which lives in core, not here).
- **`createRequestScope`'s Node vs Web branch is structural, not `instanceof`-based.** `isRequestLike()` duck-types on `"signal" in request` — a Node `IncomingMessage` and a Web `Request` are both accepted without an explicit runtime dependency on either platform's global types.
- **`getStaticPaths` walks leaves via manual accumulation, not `[...spread]`.** V8 caps spread/apply arguments (~124k on Node 24); accumulating into a shared array avoids `RangeError: Maximum call stack size exceeded` on route trees with that many static leaves.
- **`serializeState`'s XSS escape is content-agnostic** — it scans the whole serialized string for `<`/`>`/`&`, including inside `state.context` namespace values, not just top-level fields.
