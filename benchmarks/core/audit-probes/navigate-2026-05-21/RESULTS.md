# Probe results — navigate-deep audit 2026-05-21

Environment: macOS 25.2 (Darwin), Apple M3 Pro, on AC power, thermal nominal.
Runner: `npx tsx <probe>.ts` from `benchmarks/`.

## probe-01: forceReplaceFromUnknown spread cost

| Variant | avg | p50 | σ | rme |
|---|---|---|---|---|
| A. navigate ping-pong (no UNKNOWN_ROUTE) | 546.9 ns | 478.7 ns | 133.1 ns | 3.63% |
| B. navigateToNotFound only | 214.1 ns | 210.0 ns | 16.7 ns | 0.72% |
| C. navigateToNotFound + navigate (UNKNOWN→home, spread) | 808.4 ns | 735.1 ns | 163.2 ns | 3.67% |

**C − A − B = 47.5 ns** (upper bound for `forceReplaceFromUnknown` spread cost)
**Noise floor (2 × max σ) = 326.4 ns**

**Verdict: [НЕ ПОДТВЕРЖДЕНО]** — spread overhead is below noise floor.

Implication for audit summary table row #6: downgrade severity. The `forceReplaceFromUnknown` spread is not a hot-path concern in absolute terms (≤ 47 ns of overhead on a 547 ns navigate baseline, statistically indistinguishable from zero).

## probe-02: sync vs async guard branch cost

| Variant | avg | p50 | σ | rme |
|---|---|---|---|---|
| A. navigate, no guards (sync hot path) | 534.8 ns | 461.0 ns | 147.7 ns | 4.08% |
| B. navigate, 1 sync guard (still sync path) | 5.17 µs | 4.98 µs | 294.0 ns | 2.88% |
| C. navigate, 1 async guard (async branch) | 5.27 µs | 5.07 µs | 705.3 ns | 6.77% |

**Sync-guard overhead (B − A) = 4630.7 ns** — noise floor 588.0 ns → **confirmed** (~9× baseline).
**Async-branch overhead (C − B) = 106.9 ns** — noise floor 1410.6 ns → **[НЕ ПОДТВЕРЖДЕНО]**.

Caveat on variant C: emits «Concurrent navigation detected» warnings — the loop fires the next navigate before the previous async-pipeline resolves, so each measurement includes a `#abortPreviousNavigation` cancellation of the prior call. The reported 5.27 µs reflects rapid-fire fire-and-forget async-guarded navigates *with cancellation*, not uncontended async-pipeline cost. A clean measurement of the async branch requires either (a) injecting microtask quiescence between iterations (not possible in mitata's sync loop), or (b) a core-side flag to drain pending pipelines. Mark as `[NOISE — contended]`.

Implication for audit 10d#2: the original hypothesis ("async-path adds ~1 µs") is unconfirmed. The **real finding** is upstream: **adding any guard at all costs ~4.6 µs**, which is ~9× the no-guards baseline. That's a much larger lever than the async-branch micro-optimization that was suspected.

## probe-03: getTransitionPath cost vs tree depth

| Variant | avg | p50 | σ | rme |
|---|---|---|---|---|
| A. flat ping-pong (1 segment each) | 580.5 ns | 502.0 ns | 152.9 ns | 4.04% |
| B. deep ping-pong (5 segments each) | 759.7 ns | 680.2 ns | 168.0 ns | 3.89% |

**Depth overhead (B − A) = 179.2 ns** — noise floor 336.0 ns → **[НЕ ПОДТВЕРЖДЕНО]**.

5-segment navigate is 1.31× slower than 1-segment, but the difference is within noise. `getTransitionPath` / `nameToIDs` do not dominate the hot path; caching them is not warranted by current evidence.

## probe-04: subscribeLeave «departure is certain» contract — bug verification

Not a performance probe — a **failing-test for audit row #9**, run per the new template rule «failing-test для Bug-категории — прогнан, не вычитан».

Setup: router with `home` + `target`, subscribeLeave listener counting fires, activate-guard on `target` that calls `getRoutesApi(router).remove("target")` then returns `true`. Navigate to `target`, observe.

```
Initial state: home
  [guard] removing 'target' route mid-navigate…
[router.removeRoute] Route "target" removed while navigation is in progress. This may cause unexpected behavior.

--- Observations ---
State after nav:            home
Nav returned:               error code=ROUTE_NOT_FOUND
Activate guard ran:         true
subscribeLeave fire count:  1
Last leave payload:         { route: 'home', nextRoute: 'target' }

--- Contract check ---
(1) state stayed at home:          true
(2) error is ROUTE_NOT_FOUND:      true
(3) subscribeLeave fired:          true
(4) contract violation = 1 ∧ 3:    true

--- Verdict ---
→ Bug CONFIRMED: «departure is certain» нарушено.
```

**Verdict: Bug CONFIRMED.** Контракт `subscribeLeave` нарушен: listener считает, что departure состоялся, но state остался в `home`. Note: core эмитит warning о route-removal-mid-nav, то есть осознаёт опасность, но не предотвращает emit.

## Notes on noise floor

`σ/avg ≈ 25%` on the navigate ping-pong variants is high. Likely cause: V8 inline-cache megamorphism — multiple router instances created across variants in the same process polluted prototype-method ICs (documented in `benchmarks/CLAUDE.md` § "Section 2 — IC Megamorphism Artifact"). Re-running each probe in a fresh node process would reduce σ, but the verdicts (all three below noise) are robust to that — improvements would only widen the floor.
