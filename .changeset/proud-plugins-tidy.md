---
"@real-router/core": patch
---

Remove the write-only `#limits` twin from `PluginsNamespace` (#960)

- Identical dead-code pattern to the `RouteLifecycleNamespace` field removed for #960: `PluginsNamespace.#limits` was assigned in `setLimits()` but read only through `void this.#limits`, never consumed. Plugin-limit enforcement reads the limit elsewhere (the validator / `options.limits`), not this field. Removes the field, `setLimits()`, the dead `wireLimits()` call, and the unused imports + TS/eslint/Stryker suppressions.
