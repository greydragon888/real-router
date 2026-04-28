---
"@real-router/navigation-plugin": patch
---

Flatten plugin-utils into shared/browser-env (#527)

Removed `packages/navigation-plugin/src/plugin-utils.ts` — its `createStartInterceptor` and `createReplaceHistoryState` duplicates now resolve through `shared/browser-env` via the structural `LocationSource` and `ReplaceStateBrowser` types.

The "syncing" invariant — `navigation.navigate({history:"replace"})` and `navigation.navigate(...)` fire navigate events synchronously, and the plugin's own writes must short-circuit the handler — moved from manual `try/finally` blocks in `plugin.ts` and `navigate-handler.ts` to a `wrapNavigationBrowserWithSyncing` helper applied uniformly in `factory.ts` to any `NavigationBrowser` (built-in or user-supplied). No user-visible behavior change.
