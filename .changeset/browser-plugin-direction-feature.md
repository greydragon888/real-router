---
"@real-router/browser-plugin": minor
---

Publish navigation direction in `state.context.browser.direction` (#541)

`BrowserContext` now includes a `direction: "forward" | "back"` field alongside the existing `source`. Programmatic `router.navigate()` writes `"forward"`; popstate-driven navigations write `"back"`. Consumers building reverse-aware UI (e.g. direction-aware route animations) can read this synchronously instead of maintaining their own popstate listener.

The Web Platform does not expose a true forward-vs-back distinction in `popstate` events, so `"back"` is the heuristic for any popstate (browser back, browser forward, hash jump). For most UI cases — slide-aware route transitions, animation choreography — that's the meaningful signal.

```ts
import type { BrowserDirection } from "@real-router/browser-plugin";

router.subscribe(({ route }) => {
  const direction = route.context.browser?.direction;
  // ...
});
```

The new `BrowserDirection` type is exported alongside `BrowserContext` and `BrowserSource`.
