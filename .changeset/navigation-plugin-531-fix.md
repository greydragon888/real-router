---
"@real-router/navigation-plugin": patch
---

Report `navigationType` correctly after cross-document load (#531)

After F5 (`location.reload()`), browser back/forward across the JS context boundary, or a fresh URL bar entry, the plugin used to emit the initial transition with `state.context.navigation.navigationType === "replace"` regardless of how the document was actually loaded. The fallback in `onTransitionSuccess` derived the type only from `navOptions`, which always resolves to `"replace"` on the very first transition.

The plugin now reads `navigation.activation.navigationType` ([Baseline 2026](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-navigationactivation-navigationtype): Chrome 123+, Edge 123+, Firefox 147+, Safari 26.2+) in its constructor and primes `state.context.navigation` for the first transition. Affected types correctly reported now: `"reload"`, `"traverse"` (cross-document back/forward), `"push"` (typed URL / external link), `"replace"`. On browsers without `navigation.activation` the plugin falls back to the existing derivation.

Fixes scroll position restoration after F5 in `createScrollRestoration` (`shared/dom-utils/scroll-restore.ts`) — the `"reload"` branch is now reachable end-to-end, not just under synthetic fake-router tests.

The new `NavigationBrowser.getActivationType()` method has a no-op SSR fallback returning `undefined`.
