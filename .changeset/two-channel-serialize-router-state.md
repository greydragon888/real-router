---
"@real-router/ssr-utils": patch
---

`serializeRouterState` now includes `state.search` (#1548)

Under RFC-4 M2 the query channel lives in `state.search`, separate from
`state.params`. `serializeRouterState`'s payload still only carried
`{ name, params, path, context }` — the `search` field was silently dropped
from the SSR → client transport, even though `SerializedRouterState`
(`Omit<State, "transition">`) already typed it as present. A consumer reading
`window.__SSR_STATE__.search` on the client got `undefined` for every query
value. The payload now includes `search`, matching the type it was already
declared to have.
