---
"@real-router/angular": patch
---

Content-stabilize `RealLink` / `RealLinkActive` route params (#988)

The directives created their active-route source inside a constructor `effect()` (the #630 reactivity fix) that read `routeParams()` directly. Angular re-allocates an inline `[routeParams]="{ id: 1 }"` literal on every change detection, so the raw signal input changed identity each navigation even when the param content was unchanged — re-running the effect, tearing down and re-creating the cached active-route source (`canonicalJson` cache-key churn + sub/unsub) and re-running `buildHref`, once per navigation per directive.

A new internal `createStableParams` helper collapses structurally-equal params to a reference-stable value via `shallowEqual` (the same contract as the Vue `<Link>` fix and the React `Link` `memo` comparator), so the source-creation effect and the `href` computed only re-run on real content change. Behavior is unchanged — the stabilized params are always content-equal to the input; binding a stable reference still produces zero churn.
