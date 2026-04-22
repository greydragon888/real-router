---
"@real-router/browser-plugin": patch
---

Test-suite hardening + documentation cleanup from audit (#470)

Audit follow-up — Priority 2 (documentation) and Priority 3 (tests) items
from `packages/browser-plugin/.claude/review-2026-04-17.md`.

**Documentation:**

- Replaced 3 dead links to `../browser-env/ARCHITECTURE.md` (no such
  package — only `shared/browser-env/`) with concrete file references
  inside `shared/browser-env/`.
- `Performance` table in `ARCHITECTURE.md` extended with the hot-path
  optimisations applied in the previous changeset (`FROZEN_POPSTATE`/
  `FROZEN_NAVIGATE` constants, mutable `historyState` buffer via
  `createUpdateBrowserState`, memoised `getLocation`, `buildUrl`
  shortcut against `toState.path`).
- `Plugin Lifecycle` / `Factory Pattern` / data-flow sections rewritten
  to match the post-class structure (`createBrowserPlugin` function +
  `createDefaultBrowser` instead of `class BrowserPlugin`).

**Tests:**

- Replaced weak `expect(state).toBeDefined()` pre-checks with
  `expect(state?.<field>).toBe(<concrete value>)` across the property
  suite (`browserPlugin.properties.ts`) and 4 functional files
  (`lifecycle.test.ts`, `url.test.ts`, `compat.test.ts`,
  `integration.test.ts`). `expect(getState()).toBeDefined()` etc.
  replaced with the actual expected route name.
- New `expectedStressError` helper in `tests/stress/helpers.ts`
  whitelists only `SAME_STATES`, `TRANSITION_CANCELLED`,
  `ROUTE_NOT_FOUND`, `ROUTER_NOT_STARTED`. All 21 `.catch(noop)` calls
  in the 5 existing stress files now use it — any other RouterError code
  or non-RouterError surfaces as a real test failure instead of being
  silently swallowed.
- `integration.test.ts` "browser plugin works when other plugins throw on
  start" now also asserts `currentHistoryState` after `start()` and
  after a subsequent `navigate()` — proving the plugin keeps writing
  history state, not just that `start()` resolves.
- New functional test in `popstate.test.ts` covers the real
  CANNOT_DEACTIVATE recovery path: a deactivate-guard blocks a popstate
  back-navigation, and the plugin restores the URL via `replaceState`
  with the previous state. Closes the gap noted in §4 of the audit
  ("gotcha promised but not actually tested").
- Five new stress files for previously missing scenarios:
  - `replace-vs-navigate.stress.ts` — race between
    `replaceHistoryState` and concurrent `navigate()`.
  - `heap-snapshot.stress.ts` — 10 000 navigations with
    `process.memoryUsage().heapUsed` delta < 50 MiB (uses `--expose-gc`
    already enabled in `vitest.config.stress.mts`).
  - `factory-instance-cleanup.stress.ts` — 100 routers built from one
    factory, asserts net-zero `addEventListener`/`removeEventListener
    ("popstate")` after teardown.
  - `mixed-async-guards.stress.ts` — sync / 10ms / 200ms guards on
    different routes, 200 navigations, no wedge / no `console.error`.
  - `exotic-state.stress.ts` — 1000 popstate events with
    `Map`/`Date`/Symbol-keyed/closure values; `isStateStrict` must
    filter all of them.

No public API changes.
