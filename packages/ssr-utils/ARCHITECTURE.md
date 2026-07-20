# @real-router/ssr-utils

> Router-level SSR/SSG/hydration helpers — extracted from `@real-router/core/utils` (#1543)

## Source Structure

```
src/
├── serializeState.ts        — Self-contained: XSS-safe JSON escape, no core dependency
├── serializeRouterState.ts  — State → JSON, imports `State` from @real-router/core/types
├── hydrateRouter.ts         — JSON/object → router.start(), imports getInternals from @real-router/core/validation
├── getStaticPaths.ts        — Leaf-route enumeration, imports getPluginApi from @real-router/core/api
├── createRequestScope.ts    — Per-request router clone, imports cloneRouter from @real-router/core/api
└── index.ts                 — Public exports (incl. SerializedRouterState re-export from core)

tests/
├── functional/   — 5 files, one per src module (100% coverage)
├── property/     — getStaticPaths (model-based leaf-enumeration oracle), serializeRouterState (fast-check invariants)
├── stress/       — get-static-paths-scale, start-hydrate-cycles, serialize-state-xss (heap/timing regression guards)
└── helpers/      — testRouters.ts (fixture router builder, public-API-only)
```

## Why This Package Exists

Core's SSR primitives lived at `@real-router/core/utils` from #563/#596/#603
onward, but by 2026-07 that subpath was the *only* SSR-specific surface left
inside core — everything else SSR-related (`shared/ssr`'s
`createSsrLoaderPlugin`) already lived outside it. The subpath persisted by
inertia: every one of its runtime dependencies (`cloneRouter`, `getPluginApi`
→ `@real-router/core/api`; `getInternals` → `@real-router/core/validation`)
was already public, so nothing structurally required it to stay inside core.

Extracting it:

- Makes core a "pure router" — no SSR-specific code ships in the core bundle.
- Resolves the `core/utils` vs `@real-router/route-utils` naming collision
  (unrelated packages that only looked related by name — see issue #1543's
  design discussion).
- Puts the whole SSR surface outside core under two speaking names:
  `ssr-utils` (router-level, published) + `shared/ssr` (plugin-level,
  inlined) — see "Sibling, not merged, with `shared/ssr`" in CLAUDE.md.

## Dependency Direction

```
@real-router/ssr-utils
    │
    ├── @real-router/core/api          (cloneRouter, getPluginApi)
    ├── @real-router/core/validation   (getInternals)
    └── @real-router/core/types        (State, Router, SerializedRouterState, ...)
```

One-way: `ssr-utils` depends on `core`'s public subpaths, `core` has zero
runtime edge back. The only historical coupling was **type-only** —
`internals.ts`'s `RouterInternals.hydrationState: SerializedRouterState | null`
— resolved by moving the type's *definition* into `core/src/types/base.ts`
(core owns the shape of its own scratchpad) while the `serializeRouterState()`
*function* stayed here, importing the type back from `@real-router/core/types`.
No cycle: the type flows core → ssr-utils, the function stays ssr-utils-only.

## Consumers

| Consumer | How |
|----------|-----|
| `@real-router/angular` | `provideRealRouterFactory` — TransferState SSR bridge (server serialize, client hydrate) |
| `@real-router/ssr-data-plugin` (tests only) | Fixture setup — `hydrateRouter` + `serializeRouterState` to build hydration-scratchpad scenarios |
| `@real-router/rsc-server-plugin` (tests only) | Same fixture pattern |
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
