---
"@real-router/navigation-plugin": patch
---

Fix render-loop in Tauri release build on macOS 26.2 (Safari 26.2 WKWebView) (#580)

Root cause was a Safari WKWebView quirk under custom protocols (`tauri://`, `app://`): `navigation.navigate(url, { history: "replace" })` against an effectively-same URL is treated as a **cross-document navigation** that discards the JS context. The plugin's `onTransitionSuccess` issues exactly this call on the initial transition to mark the current history entry with router state — the bootstrap script then re-runs, the plugin re-issues the same call, and the cycle becomes a render-loop the user perceives as flicker (the JS context is born and dies every ~50ms).

Captured trace from a Tauri release run on macOS 26.2:

```
13ms #1 init {reinitCount:1, href:"tauri://localhost",  activationType:"push"}
16ms #2 router:transitionStart  {to:"/"}
16ms #3 router:transitionSuccess {to:"/"}
16ms #4 call:nav.navigate {url:"/", history:"replace", info:"…:syncing"}
70ms #5 init {reinitCount:2, href:"tauri://localhost/", activationType:"replace"}
…  // same pattern repeats
```

Between `#4` and `#5` there is no `event:navigate` — WKWebView did a cross-document reload directly instead of dispatching the event same-document. The previous `SyncingFlag` mechanism (and the `event.info === PLUGIN_SYNC_INFO` short-circuit added in the same PR) cannot help because the handler never runs — the JS context is gone.

**Fix**: detect "same-URL transition" in `onTransitionSuccess` and write router state via `navigation.updateCurrentEntry({state})` instead of `navigation.navigate(url, {history:"replace"})`. Both leave a single history entry carrying the new state, but `updateCurrentEntry` does not fire a navigate event and (critically for #580) does not trigger WKWebView's cross-document fallback.

The comparison (`isSameHref` in `src/href-utils.ts`) is component-wise — protocol, host, pathname (with empty pathname normalised to `"/"`), search, hash — rather than raw `.href` string equality. This matters for non-special schemes (`tauri://`, `app://`) where the URL parser preserves `pathname === ""` for authority-only URLs: `new URL("tauri://localhost").href === "tauri://localhost"` while `new URL("/", "tauri://localhost").href === "tauri://localhost/"`. A raw `.href` check would have called `nav.navigate` on the first iteration after a cold start, surviving exactly one cross-document reload before the URL stabilised in the trailing-slash form. Component-wise comparison closes that first-iteration hole.

**Companion change**: replaced the synchronous `SyncingFlag` mechanism (timing-dependent) with an identity-based `event.info === PLUGIN_SYNC_INFO` sentinel. This was the originally hypothesised fix; in practice WKWebView never delivered the event to the handler (cross-document reload, see above), but the sentinel approach is still strictly better than the flag for any future async-delivery edge case on Chromium and removes the implicit dependency on synchronous event dispatch.

**Internal API removed** (never exported from the package barrel):

- `SyncingFlag` interface
- `wrapNavigationBrowserWithSyncing` helper
- `isSyncingFromRouter` field on `createNavigateHandler` deps

**Newly exported**: `PLUGIN_SYNC_INFO` constant. Consumers supplying a custom `NavigationBrowser` should pass this value as `info` in their `nav.navigate` / `nav.traverseTo` calls so the handler can recognise plugin-originated events. The built-in factory path does this automatically. See `packages/navigation-plugin/CLAUDE.md` for the full rationale.

**Behaviour change to be aware of**: a transition that resolves to the same URL (initial transition into a same-path route, `router.navigate(name, params, {reload: true})` to current state, redirects via `forwardTo` that don't change the path) no longer fires a navigate event — the plugin updates state in-place. Consumers branching on navigate events for state-only changes should subscribe to `router.subscribe` instead; `state.context.navigation.navigationType` still reflects the logical type (`reload` / `replace` / etc.).
