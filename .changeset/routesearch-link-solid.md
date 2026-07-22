---
"@real-router/solid": minor
---

`<Link routeSearch>` query channel — RFC-4 M2 (#1548)

`<Link>` gains a `routeSearch?: SearchParams` prop — the path/query split's
view-layer channel, parallel to `routeParams`. It feeds the URL query on click
and `href`, and (with `ignoreQueryParams={false}`) the active-state check. A
`routeSearch` link takes the slow active-source path (the name-only routeSelector
fast path is query-blind, exactly like a custom `hash`).
