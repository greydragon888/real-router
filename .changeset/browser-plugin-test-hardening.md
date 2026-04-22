---
"@real-router/browser-plugin": patch
---

Test-suite hardening and new invariants from audit (#470)

Audit follow-up from `packages/browser-plugin/.claude/review-2026-04-22.md`
(sections 1, 2, 4, 5, 6, 7). No runtime behaviour changes — documentation
and test coverage only.

**New property-based invariants (`tests/property/`):**

- `safeParseUrl` is total — never throws and always returns string-typed
  fields for any input (2000 runs).
- `safeParseUrl` scheme-less path input partitions exactly into
  `pathname + search + hash`.
- `extractPath` is idempotent with an empty base.
- `buildUrl` always starts with `base` (or `/` when base is empty).
- `buildUrl` composes with `extractPath` for leading-slash paths:
  `extractPath(buildUrl(p, b), b) === p`.
- `normalizeBase` is idempotent — `normalizeBase(normalizeBase(x)) === normalizeBase(x)`.
- `normalizeBase` produces canonical form — empty or leading-slash, no
  trailing slash, no `//` runs.
- `shouldReplaceHistory` truth-table covers all `replace × reload × fromState`
  combinations (1000 runs).

**Generator improvements:**

- `arbNormalizedBase` now includes a generator for deep-nested bases
  (2–5 segments) in addition to the curated fixed list.
- `arbQueryString` mixes three value shapes: alphanumeric, percent-encoded,
  and empty (`?key=`).

**New stress scenarios (`tests/stress/`):**

- `buildurl-allocation.stress.ts` (B7.8) — 10 000 `router.buildUrl()` calls
  keep heap growth under a generous ceiling (catches closure / memoization
  leaks on the per-render hot path).
- `popstate-during-recovery.stress.ts` (B7.7) — 100 interleaved popstate
  bursts arriving during CANNOT_DEACTIVATE recovery rollback. Verifies the
  deferred queue absorbs them, no plugin-level `Critical error`/`Failed to
  recover` logs fire, and a fresh navigation still settles afterwards.

**Functional assertion upgrades:**

- `lifecycle.test.ts` — new test documents the gotcha "explicit `replace:
  false` on first navigation → push" with a `pushSpy.toHaveBeenCalledTimes(1)`
  assertion.
- `popstate.test.ts` null-state test asserts the current state is unchanged
  (or settles on UNKNOWN_ROUTE), and the meta-params edge case asserts
  stray root-level `meta` does not leak into `state.params`.
- `integration.test.ts` state-modifier test replaces the weak
  `toBeGreaterThan(0)` with a lower-bound + last-entry assertion.
- `security.test.ts` function/symbol param tests replaced the tautological
  `toBeDefined() + typeof string` with a concrete expected URL.
- `compat.test.ts` SSR block gets a warn-once verification — running start +
  4 navigations produces at most 2 SSR warnings (one per warnOnce closure
  inside `createSafeBrowser`), not N.
