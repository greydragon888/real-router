---
"@real-router/react": minor
---

Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options (#534)

`createScrollRestoration` (`shared/dom-utils/`) gains three changes:

- **Mode rename `manual` → `native`** for clarity. The previous name was misleading because it had the OPPOSITE meaning of DOM `history.scrollRestoration === "manual"`: utility's mode meant "utility does nothing, browser handles natively", while DOM `"manual"` means "browser does nothing, app handles". Renamed to `"native"` to match the actual semantic ("hand off to browser-native restore").
- **`behavior?: ScrollBehavior`** — forwarded to `scrollTo({ behavior })` and `scrollIntoView({ behavior })`. Values: `"auto"` (default), `"instant"`, `"smooth"`. See [MDN ScrollToOptions.behavior](https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions/behavior).
- **`storageKey?: string`** — sessionStorage key for scroll-store, default `"real-router:scroll"`. Override for namespace-isolation between independent `RouterProvider` instances (micro-frontends, embedded widgets, testing setups).

`RouterProvider` now forwards all three options. Default behavior unchanged.
