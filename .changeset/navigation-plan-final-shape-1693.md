---
"@real-router/core": patch
---

Restore navigate hot-path performance: the navigation plan is born in its final shape ([#1693](https://github.com/greydragon888/real-router/issues/1693))

`NavigationPlan`'s two optional fields — `controller` and `detachExternalBridge`, both introduced with the AbortController-ownership fix ([#1684](https://github.com/greydragon888/real-router/issues/1684)) — were left out of the object literal that builds the plan and written afterwards. `detachExternalBridge` is cleared unconditionally on every settle, so **every** navigation paid that write, including the ones carrying no `signal` and therefore never attaching a bridge at all.

A write to an absent property transitions the object's hidden class. The plan is allocated per navigation, so this happened on every one of them, and every reader downstream — `planPhases`, `completeImmediate`, `completeTransition`, `buildTransitionMeta` — saw two shapes instead of one. Declaring both fields in the literal is behaviour-neutral and removes the transition.

**Measured** on the benchmark runner against the tree this lands on — **12 improvements, 0 regressions, 78 benchmarks unchanged**:

| benchmark                          |  before |                after |
| ---------------------------------- | ------: | -------------------: |
| `navigate/sync-baseline`           | 11.3 ms | **7.9 ms** (+42.7 %) |
| `navigate/sync-deactivate-guards`  |  4.6 ms |     3.7 ms (+25.3 %) |
| `navigate/deep-10`                 |  5.8 ms |     4.7 ms (+23.6 %) |
| `navigate/sync-guards`             | 11.7 ms |     9.6 ms (+22.1 %) |
| `navigate/sync-guards-both-phases` |  5.5 ms |     4.5 ms (+21.2 %) |
| `navigate/forwardTo`               |  7.2 ms |       6 ms (+19.1 %) |
| `navigate/params`                  |  3.6 ms |     3.1 ms (+15.1 %) |
| `navigate/plugins-1`               |  6.7 ms |     5.8 ms (+14.9 %) |
| `navigate/deep-5`                  |    5 ms |     4.4 ms (+13.7 %) |
| `navigate/leave-1`                 |  3.6 ms |     3.2 ms (+12.1 %) |
| `navigate/leave-3`                 |  3.6 ms |     3.2 ms (+12.1 %) |
| `navigate/external-signal`         |  9.9 ms |       9 ms (+10.8 %) |

Nothing outside the navigate family moves — `matchPath/*`, `buildPath/*` and `state/*` never touch a plan.

`navigate/external-signal` is the one arm that does not return to its pre-#1684 value: it also pays for the external-signal bridge itself, ≈330 ns per navigation, which is [#1690](https://github.com/greydragon888/real-router/issues/1690). Every other navigate benchmark now reads _unchanged_ against the pre-#1684 base.
