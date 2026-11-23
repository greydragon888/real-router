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
├── errors.ts                — Loader errors and withTimeout, no core dependency
└── index.ts                 — Public exports (incl. SerializedRouterState re-export from core)

tests/
├── functional/   — one file per source module (the scratchpad is exercised through hydrateRouter.test.ts), plus clone-behaviour-1893 (100% coverage)
├── property/     — getStaticPaths (model-based leaf-enumeration oracle), hydrateRouter (scratchpad), serializeRouterState (fast-check invariants), withTimeout (race semantics)
├── stress/       — get-static-paths-scale, start-hydrate-cycles, serialize-state-xss (heap/timing regression guards), with-timeout-fan-out (no unhandled rejection from late loaders)
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

## Loader errors

`errors.ts` holds `LoaderRedirect`, `LoaderNotFound` and `LoaderTimeout`, which
a loader throws for the server's handler to map to an HTTP status, and
`withTimeout`, which rejects with a `LoaderTimeout` once its deadline passes.
The SSR plugins' `./errors` subpaths re-export the four names.

Each instance carries a mark under `Symbol.for("@real-router/ssr-utils/loader-error")`,
whose value is its class's `code`. `Symbol.hasInstance` of each class admits
what the prototype chain admits, and, when `instanceof` asks the class itself,
a value that carries the class's mark as well; a subclass reads the chain
alone. Two copies of this package in one process, or its ESM and CJS
builds, therefore hold different class objects and one answer to `instanceof`
for every error their constructors make; an object built on a class's
prototype without the constructor passes in its own copy alone, and a subclass
still admits only its own instances. The key string and the three
values are the contract between versions: a copy that spells either
differently does not recognise this copy's errors.

## Consumers

| Consumer | How |
|----------|-----|
| `@real-router/angular` | `provideRealRouterFactory` — TransferState SSR bridge (server serialize, client hydrate) |
| `@real-router/ssr-data-plugin` | `getHydrationState` in the loader's `start` interceptor (runtime); `./errors` re-exports the loader errors and `withTimeout`; `hydrateRouter` + `serializeRouterState` in test fixtures |
| `@real-router/rsc-server-plugin` | Same, through the shared loader scaffolding and its own `./errors` |
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
| `withTimeout`, loader errors | ✅ in a loader the server runs | usable in a loader the client runs |

No platform-specific imports (`window`, `document`, Node built-ins) appear in
any module — `createRequestScope`'s Node-vs-Web branch duck-types on the
shape of its `request` argument (`"signal" in request`) rather than importing
`node:http` types.
