---
"@real-router/core": minor
---

Fix: `update()` is now atomic across its whole field set (prepare-then-commit) (#951)

`update(name, updates)` applied its fields sequentially, so a throw partway through left a partial update — most notably a `forwardTo` committed first, then a guard-factory registration threw, leaving the new `forwardTo` live while the guard change was not (and likewise a custom field committed before a rejected async `forwardTo`). `update()` now runs a PREPARE phase that computes and validates every field into locals — an async/cyclic `forwardTo` (#967), a guard factory that throws on compile, and a throwing custom-field getter all surface here — followed by a COMMIT phase of pure, non-throwing writes. A failing `update()` therefore leaves the route's prior config fully intact. Guard factories are compiled once during PREPARE and installed without re-invoking (reusing the #956 compile-then-install seam), so a factory side effect still runs exactly once.
