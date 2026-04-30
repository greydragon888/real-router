---
"@real-router/angular": minor
---

Scroll restoration: rename `mode: "manual"` → `"native"`, add `behavior` and `storageKey` options (#534)

`provideRealRouter(router, { scrollRestoration })` now accepts `behavior?: ScrollBehavior` and `storageKey?: string`. The git-tracked `packages/angular/src/dom-utils/scroll-restore.ts` copy is synced with `shared/dom-utils/`. Mode `"manual"` renamed to `"native"` (semantic clarity — utility hands off to browser-native restore, opposite of DOM `history.scrollRestoration === "manual"`).
