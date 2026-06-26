---
"@real-router/core": patch
---

Remove dead write-only `#limits` field from `RouteLifecycleNamespace` (#960)

- The field was assigned in `setLimits` but read only through `void this.#limits` (a TS6133 suppression) and never consumed. Handler-limit enforcement already reads the live limits from `dependenciesStore` via `getLifecycleApi`, so router behavior is unchanged.
- Drops the redundant second copy of the limits — its `setLimits` method, the dead wiring call, and the TS/eslint/Stryker suppressions that only existed to prop up the unused field — removing a latent divergence risk between the two stores.
