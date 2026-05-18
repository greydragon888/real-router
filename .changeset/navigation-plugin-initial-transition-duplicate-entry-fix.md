---
"@real-router/navigation-plugin": patch
---

Fix duplicate history entry on initial transition (#642)

After `router.start()` resolved a cross-document load (URL bar entry, page reload, Playwright `goto`), the plugin pushed a second `navigation.entries()` row for the URL the browser had **already** committed. Result: stack length 2 for a perceived-fresh tab, `canGoBack()` returned `true`, and `peekBack()` resolved to the current route — violating the documented `canGoBack()` contract and breaking smart back-button UIs (`examples/web/react/navigation-api` Scenario 1; `examples/desktop/tauri/react-navigation` canGoBack/canGoForward toggle).

**Root cause**: the constructor's "Cross-document Activation Priming" (#531) sets `#capturedMeta.navigationType` from `navigation.activation.navigationType` — typically `"push"`. In `onTransitionSuccess` the `navigationType !== "push"` check then evaluated to `false`, so the plugin physically pushed instead of replacing.

**Fix**: when `fromState === undefined` (first transition after start), the plugin now physically `replace`s the entry — the browser's own entry stays as the single stack row. `state.context.navigation.navigationType` metadata is **unchanged** (`"push"` / `"reload"` / `"replace"` continue to flow to consumers) — scroll restoration (#497) and direction tracker logic are not affected.

**Verified**: 236 unit tests + 37/37 react-navigation-api e2e + 8/8 tauri-react-navigation e2e pass.
