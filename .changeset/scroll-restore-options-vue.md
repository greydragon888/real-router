---
"@real-router/vue": minor
---

Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options (#534)

`<RouterProvider>` now watches `scrollRestoration?.behavior` and `scrollRestoration?.storageKey` as primitive deps and forwards them to `createScrollRestoration` on remount. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).
