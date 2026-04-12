---
"@real-router/core": minor
---

Add `PluginApi.claimContextNamespace()` and shallow-freeze refactor (#434)

New `claimContextNamespace(namespace)` helper on `PluginApi` — follows the same architectural model as the existing `extendRouter()` API: closure-based ownership, manual `release()` in plugin teardown, dispose safety net for forgotten releases. Uses `Set<string>` for O(1) conflict detection, registration, release, and safety-net clear.

```typescript
const myPlugin: PluginFactory = (router) => {
  const api = getPluginApi(router);
  const claim = api.claimContextNamespace("navigation");

  return {
    onTransitionSuccess(toState, fromState) {
      claim.write(toState, { direction: detectDirection(fromState, toState) });
    },
    teardown() {
      claim.release();
    },
  };
};

// Later, in components:
route.context.navigation?.direction;
```

`claim.write(state, value)` is a literal one-line property assignment — zero overhead on the hot path (no validator dispatch, no optional chain, no runtime checks). `claim.release()` is naturally idempotent via `Set.delete`.

Core enforces one runtime invariant: `CONTEXT_NAMESPACE_ALREADY_CLAIMED` — a namespace can be held by at most one active claim. Double-claiming throws a `RouterError` with this code. Orphaned claims (plugin forgot to release in teardown) are cleaned up by the dispose safety net.

**Freeze pipeline refactored from recursive to targeted shallow freezing.** Previously, `freezeStateInPlace()` deep-froze every nested object on every navigation. Now the producers of each nested structure freeze at creation time (`params` in `makeState`, `segments`/`transition` in `buildTransitionMeta`, `deactivated`/`activated` arrays), and the final step is a single shallow `Object.freeze(state)`. `state.context` is **intentionally not frozen** so plugins can publish data after state creation. `deepFreezeState()` is unchanged (still used by `RouterError.redirect`).

**New error code:** `CONTEXT_NAMESPACE_ALREADY_CLAIMED`.

**Plugin authors:** if you want to protect your payload from subscriber mutation, freeze it yourself at the call site (`claim.write(state, Object.freeze(payload))`). Same model as `extendRouter()`.
