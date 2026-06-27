---
"@real-router/core": minor
---

Fix: `update(name, { forwardTo })` rejects an async callback at update time (parity with add/replace) (#967)

`add` / `replace` reject an async `forwardTo` callback at registration (`assertForwardToNotAsync` → "forwardTo callback cannot be async for route …"), but `update`'s path stored it silently — the failure then surfaced at navigation as a generic `TypeError: forwardTo callback must return a string, got object`. `updateForwardTo` now runs the same `assertForwardToNotAsync` check first, so `update(name, { forwardTo: async () => … })` throws the actionable, route-named error at registration, matching `add`/`replace`.
