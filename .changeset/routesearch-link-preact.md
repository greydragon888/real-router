---
"@real-router/preact": minor
---

`<Link routeSearch>` query channel — RFC-4 M2 (#1548)

`<Link>` gains a `routeSearch?: SearchParams` prop — the path/query split's
view-layer channel, parallel to `routeParams`. It feeds the URL query on click
and `href`, and (with `ignoreQueryParams={false}`) the active-state check. The
internal `useIsActiveRoute` hook gains a matching `search` argument at position 3.
