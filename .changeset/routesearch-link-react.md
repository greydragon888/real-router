---
"@real-router/react": minor
---

`<Link routeSearch>` / `<InkLink routeSearch>` query channel — RFC-4 M2 (#1548)

Both link components gain a `routeSearch?: SearchParams` prop — the path/query
split's view-layer channel, parallel to `routeParams`. It feeds the URL's query
string on click (`navigate`) and in `href` (`buildUrl` / `buildPath` at position
3), and — with `ignoreQueryParams={false}` — the active-state check. The internal
`useIsActiveRoute` hook gains a matching `search` argument at position 3 (trailing
positional flags shift by one). A route's query still works when passed inside
`routeParams`; `routeSearch` is the explicit, type-clean channel.
