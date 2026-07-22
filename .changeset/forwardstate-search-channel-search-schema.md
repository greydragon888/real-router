---
"@real-router/search-schema-plugin": minor
---

Validate the query channel on the URL→State path (#1548)

Under the params/search split the matched query arrives on `state.search`. The
`forwardState` interceptor is now channel-aware: it validates `state.search` on
the URL→State (matchPath) path and the params bag on the navigate path, so
`router.start(url)` and popstate-driven URLs validate their query against the
schema — closing the previously-deferred gap (the un-skipped
"validate params from URL on router.start()" test).
