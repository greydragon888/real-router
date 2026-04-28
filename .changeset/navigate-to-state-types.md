---
"@real-router/types": minor
---

Add `PluginApi.navigateToState` type signature (#525)

`PluginApi` interface in `@real-router/types` now declares the new
`navigateToState(state, options?)` method introduced in `@real-router/core`.
This is the typed surface plugin authors interact with via
`getPluginApi(router).navigateToState(...)`.

```typescript
interface PluginApi {
  navigateToState: (
    state: State,
    options?: NavigationOptions,
  ) => Promise<State>;
  // ... existing members
}
```

Type-only addition. No runtime behavior change in this package.
