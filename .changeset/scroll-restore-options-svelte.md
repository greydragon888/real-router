---
"@real-router/svelte": minor
---

Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options (#534)

`<RouterProvider>` derives `srBehavior` and `srStorageKey` from `scrollRestoration` props and forwards them to `createScrollRestoration`. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).
