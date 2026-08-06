---
"@real-router/core": patch
---

Restore navigate hot-path performance: the navigation plan is born in its final shape ([#1693](https://github.com/greydragon888/real-router/issues/1693))

`NavigationPlan`'s two optional fields — `controller` and `detachExternalBridge`, both introduced with the AbortController-ownership fix ([#1684](https://github.com/greydragon888/real-router/issues/1684)) — were left out of the object literal that builds the plan and written afterwards. `detachExternalBridge` is cleared unconditionally on every settle, so **every** navigation paid that write, including the ones carrying no `signal` and therefore never attaching a bridge at all.

A write to an absent property transitions the object's hidden class. The plan is allocated per navigation, so this happened on every one of them, and every reader downstream — `planPhases`, `completeImmediate`, `completeTransition`, `buildTransitionMeta` — saw two shapes instead of one. Declaring both fields in the literal is behaviour-neutral and removes the transition.

**Measured** on the benchmark runner with one variable — the same tree, the same harness, the same hour — before and after this two-field change:

| benchmark                                                |  before |              after |
| -------------------------------------------------------- | ------: | -----------------: |
| `navigate/sync-baseline`                                 | 11.3 ms | **8 ms** (+42.5 %) |
| `navigate/sync-deactivate-guards`                        |  4.6 ms |   3.7 ms (+25.2 %) |
| `navigate/deep-10`                                       |  5.8 ms |   4.7 ms (+23.5 %) |
| `navigate/sync-guards`                                   | 11.7 ms |   9.6 ms (+22.1 %) |
| `navigate/sync-guards-both-phases`                       |  5.5 ms |   4.5 ms (+21.2 %) |
| `navigate/forwardTo` · `params` · `plugins-1` · `deep-5` |         |           +14–15 % |
| `navigate/leave-1` · `leave-3`                           |         |              +12 % |

Eleven improvements, no regressions, and 79 benchmarks unchanged. Against the pre-#1684 base the whole suite now reads _unchanged_ except `navigate/external-signal`, whose separate cost is [#1690](https://github.com/greydragon888/real-router/issues/1690).
