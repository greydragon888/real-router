---
"@real-router/persistent-params-plugin": minor
---

Forward the query channel through the forwardState interceptor (#1548)

The `forwardState` interceptor now passes the third `search` argument down the
chain, so a downstream `search-schema-plugin` interceptor still observes the
matched query on the URL→State path. Persistent params keep being injected into
the path bag (the navigate split re-routes the query-typed ones into
`state.search`).
