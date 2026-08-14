---
"@real-router/core": patch
---

Pass 2 of the navigation prologue demands an announced plan (#1588)

`planPhases` reads the lifecycle maps, and a `TRANSITION_START` listener may
still register a guard — so it has to run after the announce. That order was
held by a JSDoc sentence, and measured: calling it before `startTransition`
leaves the whole tier green, 4092 of 4092.

`beginTransition` now returns an `AnnouncedPlan` — a branded `NavigationPlan`
minted in one place, below the send — and `planPhases` accepts nothing else, so
the wrong order is `TS2345` at the call site. The brand is a `unique symbol`
that is never exported, erased at runtime, and the plan object is untouched: no
field, no allocation, `plan-born-in-final-shape` unaffected.

Also in this change: the `hasGuards` comment names the pin that keeps it honest
(`guards-off-path` counts controllers on both halves of the predicate) instead
of only describing what it measured.
