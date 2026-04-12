---
"@real-router/types": minor
---

Add `StateContext` and `ContextNamespaceClaim` interfaces, make `State.context` required (#434)

New `StateContext` empty interface for plugin-extensible route data via module augmentation:

```typescript
declare module "@real-router/types" {
  interface StateContext {
    navigation: { direction: "forward" | "back" | "navigate" };
  }
}

// Now typed:
route.context.navigation?.direction;
```

New `ContextNamespaceClaim<T>` interface — returned by `PluginApi.claimContextNamespace()`, exposes `write(state, value)` and `release()` methods. Plugins use it to publish per-navigation data to `state.context.<namespace>` with collision detection.

`State.context` is now a **required** (non-optional) field of type `StateContext & Record<string, unknown>`. Always present as `{}` at minimum on every state — created by `makeState`, `navigateToNotFound`, and `cloneRouter`. The intersection with `Record<string, unknown>` keeps the type open so inline plugins and tests can write arbitrary namespaces without augmenting the interface.

**Breaking change (pre-1.0):** Code that manually constructs `State` objects (test fixtures, mock states) must now include `context: {}`.
