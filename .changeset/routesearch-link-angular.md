---
"@real-router/angular": minor
---

`[realLink routeSearch]` query channel — RFC-4 M2 (#1548)

The `RealLink` directive gains a `routeSearch` signal input — the path/query
split's view-layer channel, parallel to `routeParams`. It feeds the URL query on
click and `href`, and (with `[ignoreQueryParams]="false"`) the active-state check.
`injectIsActiveRoute` gains a matching `search` argument at position 3 (`options`
shifts to 4). `RealLinkActive` stays styling-only (no `routeSearch`, parity with
its no-`hash` policy).
