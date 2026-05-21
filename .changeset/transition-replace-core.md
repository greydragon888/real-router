---
"@real-router/core": minor
---

Add `state.transition.replace` for portable push/replace discrimination across URL plugins

`TransitionMeta` gains an optional `replace?: boolean` field, written in three places — symmetric with the existing `reload` / `redirected` flags:

- `completeTransition()` lifts `opts.replace` from `NavigationOptions` (including the result of `forceReplaceFromUnknown()`, Invariant 12)
- `navigateToNotFound()` writes `replace: true` inline, mirroring the `FROZEN_REPLACE_OPTS` plugins already see via `onTransitionSuccess`'s 3rd argument (Invariant 7)
- `DEFAULT_TRANSITION` is unchanged

Subscribers can now portably discriminate replace transitions under any URL plugin (browser, hash, navigation, memory, or no plugin):

```ts
router.subscribe(({ route }) => {
  if (route.transition.replace) return; // skip programmatic redirects / corrections / auto-replace from UNKNOWN_ROUTE
  analytics.pageView(route.path);
});
```

Existing usage of `state.context.navigation.navigationType === "replace"` (navigation-plugin only) continues to work — the two signals complement each other. See `packages/core/CLAUDE.md` → "Core vs plugin signals" for the side-by-side comparison.

The new field is additive, optional, and zero API-breaking on the core type level. It is stripped from `serializeRouterState` along with the rest of `transition` (per-navigation meta is meaningless after hydration).
