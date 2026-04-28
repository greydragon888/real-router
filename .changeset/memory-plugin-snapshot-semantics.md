---
"@real-router/memory-plugin": minor
---

memory-plugin: snapshot semantics for back/forward via api.navigateToState (#561)

`#go(delta)` (used by `router.back()` / `router.forward()` / `router.go()`)
now commits the stored State snapshot via
`getPluginApi(router).navigateToState(stored, { replace: true })` instead of
re-resolving via `router.navigate(entry.name, entry.params)`. This closes
the consistency gap with browser-plugin / hash-plugin / navigation-plugin —
all four URL-driven plugins now use the same primitive (#525).

**Storage:** `#entries` now holds full `State` objects instead of the
internal `HistoryEntry { name, params, path }` shape. Memory cost is
roughly +80 bytes per entry; on the default `maxHistoryLength: 1000`
budget that is ~80 KB worst case for a saturated buffer. `HistoryEntry`
was never exported publicly, so no API breakage.

**Behavior change** (the reason this is `minor`, not `patch`):

For consumers with non-idempotent dynamic interceptors or routes mutated
between record and replay, back/forward now commits the snapshot stored
at original navigation time, not a re-resolved State. Concrete cases:

- Dynamic `forwardFn` reading mutable state: stored target wins on back.
  Re-evaluation of current world state belongs in `canActivate` guards,
  which still run on every replay.
- `routes.update()` / `routes.replace()` between record and replay: the
  stored entry is immune to post-recording mutations. If the route was
  removed, `navigateToState` rejects with `ROUTE_NOT_FOUND` and `#go`'s
  reject handler reverts `#index`.
- `defaultParams` callbacks reading mutable state: stored params win.
- `buildPath` interceptors do NOT re-fire on back/forward (matches the
  contract URL plugins already follow post-#525).

**Migration:** consumers who relied on re-resolve semantics — likely
empty set — can opt back into re-resolve explicitly:

```ts
const current = router.getState();
await router.navigate(current.name, current.params, { force: true });
```

Inherited from #525: 5–20% perf reduction per `back()` / `forward()`
(skipped `forwardState` + `buildPath` round-trip in `buildNavigateState`).

Same-path short-circuit (`entry.path === currentState?.path → skip
commit, only update direction + historyIndex`, #508) is unchanged.
