---
"@real-router/solid": minor
---

Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options (#534)

`scrollRestoration` prop now accepts `behavior?: ScrollBehavior` and `storageKey?: string`. Solid forwards the entire `props.scrollRestoration` object to `createScrollRestoration`, so no provider-side changes were needed. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).
