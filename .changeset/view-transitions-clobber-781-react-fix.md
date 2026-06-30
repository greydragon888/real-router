---
"@real-router/react": patch
---

Fix View Transitions: a stale success resolver no longer clobbers the next navigation's transition (#781)

`createViewTransitions` schedules the `TRANSITION_SUCCESS` deferred-resolver via `setTimeout(0)`, which unconditionally set `currentVT = null` when it ran. If the next navigation started in the task-queue window after success (e.g. `await router.navigate(b); router.navigate(c)`), its leave opened a new view transition and set `currentVT` to it — then the previous success's stale `setTimeout` fired and reset the reference back to `null`. A subsequent cancellation then read `null` and skipped nothing, so a stale animation (old DOM snapshot → cancelled state) leaked; `destroy()` in that window also could not skip it.

The resolver now captures the transition it belongs to and only clears `currentVT` when it is still that same transition (`if (currentVT === scheduledVT)`), so a concurrent navigation's transition survives. Router behaviour is unchanged — the deferred still resolves; only the harmful visual clobber is removed.
