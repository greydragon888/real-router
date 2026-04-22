---
"@real-router/navigation-plugin": patch
---

Fix `replaceHistoryState` hash preservation and guard `isSyncingFromRouter` against stuck state (#496)

Two related correctness fixes in the navigation-plugin internals:

**1. `replaceHistoryState` now preserves `location.hash`** — symmetric with `onTransitionSuccess`.

```ts
// URL before: /home#anchor
router.replaceHistoryState("users.view", { id: "123" });
// URL after:  /users/view/123#anchor  (hash preserved)
```

This matches the behavior already documented in `CLAUDE.md` and the wiki.
Previously the local `createReplaceHistoryState` implementation dropped the
hash, while the equivalent helper in `browser-plugin` kept it — causing a
subtle divergence between the two plugins.

**2. `isSyncingFromRouter` is now released in a `finally` block** at all three
set-sites (`onTransitionSuccess`, `createReplaceHistoryState`, and the
navigate-error recovery path). If the internal `browser.navigate` /
`browser.replaceState` / `browser.traverseTo` call throws, the sync flag
will no longer get stuck in the `true` state, which previously caused
all subsequent browser-initiated navigations to be silently ignored.

This enforces invariant D4 from `INVARIANTS.md` ("isSyncingFromRouter Error
Recovery") — see `packages/navigation-plugin/INVARIANTS.md`.
