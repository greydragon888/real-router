---
"@real-router/types": minor
---

Remove `State.meta` from public API, remove `forceId` from `PluginApi.makeState` (#202)

**Breaking Change:** `State` no longer exposes `meta` property. `StateMeta` type removed from public exports. Second type parameter `MP` removed from `State<P, MP>` (now `State<P>`). `forceId` parameter removed from `PluginApi.makeState`.

`TransitionMeta` extended with optional `reload` and `redirected` fields.

**Migration:**

```diff
- if (state.meta?.options?.redirected) { ... }
+ if (state.transition?.redirected) { ... }

- if (state.meta?.options?.reload) { ... }
+ if (state.transition?.reload) { ... }

- const guard = (router: Router) => (toState: State<P, MP>) => { ... }
+ const guard = (router: Router) => (toState: State<P>) => { ... }

- api.makeState("route", params, path, meta, forceId)
+ api.makeState("route", params, path, meta)
```
