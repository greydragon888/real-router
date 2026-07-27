---
"@real-router/persistent-params-plugin": minor
---

Search-aware forwardState and buildPath interceptors (#1548)

Both interceptors now take the third `search` argument (RFC-4 M2). The
`forwardState` interceptor forwards it down the chain, so a downstream
`search-schema-plugin` interceptor still observes the matched query on the
URL→State path. The `buildPath` interceptor is search-aware: when the caller
supplies an explicit `search` channel, persistent (query) params are injected
there — the channel the built URL takes its query from. (#1563 completes the
move: the single-bag call shape injects into `search` as well.)
