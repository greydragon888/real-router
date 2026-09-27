---
"@real-router/vue": minor
---

Export `createDirectionTracker` from the package entry (#2587)

`createDirectionTracker(router)` writes `data-nav-direction="forward" | "back"` on `<html>` on every leave, so exit and entry animations can key off the navigation direction. Install it before `router.usePlugin(browserPluginFactory())`: both listen to `popstate`, and the tracker has to see the event first. `destroy()` removes the listener and the attribute; without a `document` (SSR) it returns a no-op instance. The `DirectionTracker` type is exported alongside. The API is unstable — it may change in a minor release.
