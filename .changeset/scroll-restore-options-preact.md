---
"@real-router/preact": minor
---

Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options (#534)

See `@real-router/react` changeset for full details. The `RouterProvider` now forwards `behavior?: ScrollBehavior` and `storageKey?: string` from `scrollRestoration` options to `createScrollRestoration`. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).
