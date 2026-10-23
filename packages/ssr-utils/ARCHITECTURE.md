# @real-router/ssr-utils

> Router-level SSR/SSG/hydration helpers, kept outside `@real-router/core`

## Source Structure

```
src/
├── serializeState.ts        — Self-contained: XSS-safe JSON escape, no core dependency
├── serializeRouterState.ts  — State → JSON, imports `State` from @real-router/core/types
├── hydrateRouter.ts         — JSON/object → router.start(), imports getPluginApi from @real-router/core/api
├── hydrationScratchpad.ts   — Module-private WeakMap; getHydrationState (exported) and the deposit hydrateRouter uses
├── getStaticPaths.ts        — Leaf-route enumeration, imports getPluginApi from @real-router/core/api
├── createRequestScope.ts    — Per-request router clone, imports cloneRouter from @real-router/core/api
└── index.ts                 — Public exports (incl. SerializedRouterState re-export from core)

tests/
├── functional/   — one file per exported function (the scratchpad is exercised through hydrateRouter.test.ts), plus clone-behaviour-1893 (100% coverage)
├── property/     — getStaticPaths (model-based leaf-enumeration oracle), serializeRouterState (fast-check invariants)
├── stress/       — get-static-paths-scale, start-hydrate-cycles, serialize-state-xss (heap/timing regression guards)
└── helpers/      — testRouters.ts (fixture router builder, public-API-only)
```

## Why This Package Exists

A package of their own keeps the SSR helpers out of core, so core stays a pure
router: no SSR-specific code ships in the core bundle. Nothing ties them to
core's internals — their runtime dependencies, `cloneRouter` and
`getPluginApi`, come from the public `@real-router/core/api`.

- The whole SSR surface sits outside core under two speaking names:
  `ssr-utils` (router-level, published) + `shared/ssr` (plugin-level,
  inlined) — see "Sibling, not merged, with `shared/ssr`" in CLAUDE.md.
- ⚠ `@real-router/core/utils` is not the SSR home. That subpath publishes
  core's discipline primitives for plugins, `putField` / `copyFields` among
  them; nothing SSR-related lives there, and this package does not import it.

## Dependency Direction

```
@real-router/ssr-utils
    │
    ├── @real-router/core/api          (cloneRouter, getPluginApi)
    └── @real-router/core/types        (State, Router, SerializedRouterState, ...)
```

One-way: `ssr-utils` depends on `core`'s public subpaths, `core` has zero
runtime edge back. `SerializedRouterState` is defined in `core/src/types/base.ts`
— the shape is core's own `State` — and imported here from
`@real-router/core/types`. No cycle: the type flows core → ssr-utils.

## Hydration scratchpad

`hydrationScratchpad.ts` owns a module-private `WeakMap` keyed by router.
`hydrateRouter` is its only writer: it deposits the parsed state before
`router.start()` and restores the previous value in `finally`.
`getHydrationState(router)` is the only exported door, and it reads. SSR loader
plugins call it from their `start` interceptor, so writer and reader must
resolve the same copy of this package — `ssr-data-plugin` and
`rsc-server-plugin` declare it as a `dependency` for that reason.

## Consumers

| Consumer | How |
|----------|-----|
| `@real-router/angular` | `provideRealRouterFactory` — TransferState SSR bridge (server serialize, client hydrate) |
| `@real-router/ssr-data-plugin` | `getHydrationState` in the loader's `start` interceptor (runtime); `hydrateRouter` + `serializeRouterState` in test fixtures |
| `@real-router/rsc-server-plugin` | Same, through the shared loader scaffolding |
| 6 SSR/SSG/streaming/mixed example apps × 6 frameworks (React, Preact, Solid, Vue, Svelte, Angular) | `entry-client` / `entry-server` boilerplate |

Not consumed by `@real-router/core` itself, and not merged into
`shared/ssr` — see CLAUDE.md for the layering rationale.

## Isomorphism

| Function | Server | Client |
|----------|--------|--------|
| `serializeState` / `serializeRouterState` | ✅ primary use | usable, rarely needed |
| `hydrateRouter` | usable, rarely needed | ✅ primary use |
| `getStaticPaths` | ✅ SSG build step | not typically called |
| `createRequestScope` | ✅ Node/Web request lifetime | N/A (no request object) |

No platform-specific imports (`window`, `document`, Node built-ins) appear in
any module — `createRequestScope`'s Node-vs-Web branch duck-types on the
shape of its `request` argument (`"signal" in request`) rather than importing
`node:http` types.
