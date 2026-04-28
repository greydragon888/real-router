---
"@real-router/preload-plugin": minor
---

preload-plugin: cache pre-resolved State on hover, expose via `router.getPreloadedState(href)` (#562)

When `mouseover`/`touchstart` resolves an anchor's URL through `router.matchUrl`, the resulting `State` is now cached internally by `href` in a small bounded Map (limit 32, insertion-order eviction). Consumers can read it via the new router extension:

```ts
const cachedState = router.getPreloadedState?.(anchor.href);
if (cachedState) {
  getPluginApi(router).navigateToState(cachedState, { replace: false });
} else {
  router.navigate(routeName, params);
}
```

**Single-use semantics** — the entry is deleted on read so the consumer never re-uses a stale snapshot. Re-hovering the same anchor repopulates the cache.

**Snapshot semantics** match `memory-plugin` post-#561 and URL plugins post-#525: activation guards still run on commit, but `forwardState`/`buildPath` interceptors do not re-fire (they ran when the cached State was minted via `matchPath`). For consumers relying on dynamic interceptors, fall back to `router.navigate(name, params)`.

**Cache populated even without `preload` factory** — the State is useful for fast navigation independently of preload.

**Cleared on `onStop` and `teardown`.** The `getPreloadedState` extension is removed in `teardown`.

This is a plugin-only change. No framework adapters were modified — apps that want the optimization wrap `<Link>` in a custom `<FastLink>` consumer (recipe in the wiki).
