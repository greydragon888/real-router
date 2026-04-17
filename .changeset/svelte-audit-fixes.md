---
"@real-router/svelte": minor
---

Audit-driven hardening of @real-router/svelte (#462)

- **Hot path:** introduce `src/constants.ts` (`EMPTY_PARAMS`, `EMPTY_OPTIONS`) and use them as defaults in `<Link>` and `createLinkAction` to remove per-render / per-click `{}` allocations
- **Hot path:** extract `createRouteContext` helper used by `RouterProvider` and `useRouteNode` — eliminates the per-access object allocation of the previous double-getter pattern; each consumer now gets a stable `route` / `previousRoute` view
- **`<Lazy>`:** validate that `loader()` resolves to an object with a `default` export — silent empty renders are replaced with a clear error message; non-Error rejections are wrapped into `Error` instances; status modeled as a discriminated union
- **`createLinkAction`:** honor `target="_blank"` on anchor elements (consistent with `<Link>`); deduplicate the navigate path between click and Enter handlers; remove `eslint-disable @typescript-eslint/no-non-null-assertion` via locally-narrowed `router`
- **`<RouteView>`:** the snippet name `notFound` is now strictly reserved for the `UNKNOWN_ROUTE` fallback — even a literal route named `notFound` will not pick the snippet as a regular segment match. Hoisted `getActiveSegment` to module scope as a pure function with `for…in` iteration and pre-computed segment prefix
- **`<RouterErrorBoundary>`:** `onError` callbacks that throw are now caught, logged via `console.error`, and never break downstream reactivity
- **Tests:** ~24 assertion-quality fixes across functional tests; new negative test for gotcha "previousRoute is global"; new `getActiveSegment` unit tests covering the `notFound` collision; property tests now exercise the real `dom-utils` exports instead of inline replicas
- **Stress:** +9 stress tests in 4 new files — `lazy-loading.stress.ts`, `error-boundary.stress.ts`, `teardown-race.stress.ts`, `long-run-leak.stress.ts` (38 stress tests in 12 files total)
- **Docs:** README/CLAUDE/ARCHITECTURE/wiki brought back in sync with the source: `RouterErrorBoundary` listed in every API table; `onError` signature documented as `(error, toRoute, fromRoute)`; example count corrected (16 examples); ARCHITECTURE.md source structure no longer references non-existent files
