---
"@real-router/core": minor
---

Remove unused public API surface surfaced by the mutation audit (YAGNI) (#925)

- `RouterError` no longer accepts or exposes `redirect`. The field was never produced or consumed by any router code path — guards cannot redirect (`GuardFn` returns `boolean` only), and the supported redirect mechanism is declarative route-config `forwardTo`. A thrown object with a `redirect` key is now carried as plain metadata instead of being rejected. Migration: if you constructed `new RouterError(code, { redirect })`, pass it as a plain custom field (e.g. `{ redirectTo }`).
- `getDependenciesApi(router).setDependency(...)` now returns `void` instead of an always-`true` `boolean` — the return value was never meaningful.
- Drops the internal `deepFreezeState` helper (its only caller was the redirect path) and the dead `origin` parameter on the internal `clearCanActivate` / `clearCanDeactivate`.
