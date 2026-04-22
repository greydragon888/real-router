---
"@real-router/memory-plugin": patch
---

Fix stale `state.context.memory` after short-circuit `back()`/`forward()` (#508)

When `back(-1)` or `forward(+1)` lands on a history entry whose `path` equals the current router state path (e.g. history `[home, home]` after a `replace`), `#go(delta)` previously updated `#index` synchronously but left `state.context.memory` unchanged — so `direction` and `historyIndex` reflected the last full transition, not the short-circuit move. UI code relying on `direction` for animation saw stale data, and the bi-implication `canGoBack() ⇔ state.context.memory.historyIndex > 0` broke on those entries.

The short-circuit branch now rewrites `state.context.memory` in place with the new `historyIndex` and `direction` (`"back"` or `"forward"`). The state object identity is preserved (no full transition), but subscribers observe the correct direction signal. The previously skipped property-based test for the `canGoBack ⇔ historyIndex > 0` bi-implication has been re-enabled.
