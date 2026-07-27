---
"@real-router/browser-plugin": patch
---

Keep a forwarding route's query defaults in the `replaceHistoryState` record (#1574)

`createReplaceHistoryState` (shared `browser-env`) built the `history.state`
record from the caller's raw `search` while taking `name`/`params` from the
resolved state. That asymmetry dropped every query value the caller did not
spell out — above all the query half of a `forwardTo` chain's own
`defaultParams`, which exists only after resolution.

Measured on `archive → posts` with `archive.defaultParams = {id, tab}` and
`posts = "/posts/:id?tab"`: the record read `{params: {id: "7"}, search: {},
path: "/posts/7"}` while the address bar carried the query. The path half of the
same `defaultParams` bag survived, the query half did not — and a Back that
restored that record committed the page without its query.

Both channels now come from the one resolution: the caller's `search` is passed
INTO `buildNavigationState` (the third slot added in #1571) and the record is
rebuilt from `state.search`. An explicit caller value still beats the hop
default it collides with — `separateChannels` spreads the caller's bag last —
so this only adds back what was silently lost.

Passing `search` in also means the `forwardState` seam finally sees the query
channel, so a `search-schema` or `persistent-params` interceptor registered on
it observes what the caller actually sent instead of `undefined`.

The URL half is untouched: it still comes from the plugin's `buildUrl`, and its
own divergence for a forwarding route (`buildPath` prints the SOURCE path) is a
separate, tracked `buildPath` defect.
