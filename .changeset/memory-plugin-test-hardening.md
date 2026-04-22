---
"@real-router/memory-plugin": patch
---

Test-suite hardening and new invariants from audit (#511)

Audit follow-up — items from `packages/memory-plugin/.claude/review-2026-04-22.md`
(categories 1, 3, 4, 5, 7, 10-13). No runtime behaviour changes — this is
exclusively documentation and test coverage work.

**New property-based invariants (`tests/property/`, #3/#6.3):**

- `direction === 'navigate'` is written for every successful push (including
  the first one from `router.start()`).
- `maxHistoryLength=1` idempotency: at cap=1, `canGoBack()`/`canGoForward()`
  are always `false` and `historyIndex === 0` regardless of the action sequence.
- `N × back()` followed by `N × forward()` (for distinct-path pushes without
  guards) returns to the same `path`.
- Bi-implication `canGoBack() ⇔ state.context.memory.historyIndex > 0` is
  declared but currently `describe.skip`'d with a TODO referencing #508 — the
  short-circuit branch leaves `context.memory` stale, so the property does not
  hold until #508 is fixed.

`INVARIANTS.md` updated with invariants 12-14 and a new "State Context" section.

**New stress scenarios (`tests/stress/`, #4):**

- `back-then-navigate-race.stress.ts` (S11) — `back()` in flight + immediate
  `navigate()`: verifies the `#navigatingFromHistory` flag does not leak to
  `true` and subsequent pushes still land.
- `navigate-replace-overlap.stress.ts` (S12) — two concurrent navigations
  (one with an async guard, one with `{ replace: true }`): verifies the
  second supersedes the first and history stays consistent.
- `memory-leak.stress.ts` (S13) — 1000 `start → navigate × 5 → stop →
  unsubscribe` cycles keep heap growth under 25× the baseline; a single
  long-lived router with 10 000 navigations respects `maxHistoryLength=100`
  exactly (final `historyIndex === 99`, 99 back-steps reachable).
- `maxhistory-1-cap.stress.ts` (S14) — 1000 successful pushes at cap=1 keep
  index at 0; `back()`/`forward()`/`go(±N)` are always no-ops; alternating
  push + replace never grows the stack past 1 entry.

**Tautological assertions removed (#5):**

- `expect(typeof router.canGoBack()).toBe("boolean")` and variants in
  `concurrent-back-forward.stress.ts`, `generation-guard-async.stress.ts`,
  `stale-entries.stress.ts` replaced with concrete index-range assertions
  via `state.context.memory.historyIndex`.
- `expect(activations).toBeGreaterThan(0)` in S9.1 tightened to also assert
  an upper bound (`≤ 10`).

**Property-test generator tuning (#11, #12):**

- `NUM_RUNS` now scales with CI: `standard` and `async` bump from 100 to 300
  under `process.env.CI`, `lifecycle` from 50 to 100. Local runs unchanged.
- `arbRouteWithParams` for the `user` route narrowed from `id: 1-100` to
  `id: 1-3` so the shrinker can explore same-id collisions.
- New `arbActionSequenceLong` (30-100 actions) exported for marathon scenarios.

**Documentation (#7, #10, #13):**

- The functional test "should update index without navigating when back()
  targets same state" was split into two: (a) short-circuit behavior with
  explicit `vi.spyOn(router, "navigate")` + assertion that `navigate` is
  not called, and (b) a separate test for the different-path back() case.
  The short-circuit test includes a TODO comment referencing #508 to track
  the stale `context.memory` bug.
- `CLAUDE.md` gotchas about `go(0)`, `go(NaN)`, `go(±Infinity)`, `go(0.5)`
  merged into a single block. The `.catch()`/`.finally()` gotcha reworded to
  match the new `.then(onResolve, onReject)` wiring. A new gotcha documents
  the short-circuit branch and its stale-context limitation (#508).
- Wiki (`memory-plugin.md`) gets a matching "Short-circuit" section.
