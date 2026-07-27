---
"@real-router/search-schema-plugin": minor
---

Validate the query channel, not a bag picked by call shape (#1564)

The `forwardState` interceptor chose what to validate from `routeSearch !== undefined`, which is a question about the CALL, not about where the query lives. It now subtracts the route's path slots — its own and its ancestors', read off the engine's `paramMeta` via `getTree()` and cached per tree identity — and validates everything else, `search` merged over the params bag.

- **A path param is never handed to the schema.** A transforming schema no longer rewrites `state.params.id`, and `strict: true` no longer deletes it — which used to abort the navigation with `[SegmentMatcher.buildPath] Missing required param 'id'` on a v1 single-bag `navigate(name, { id, q })`.
- **The query channel is validated on both directions.** Anything an inner interceptor injected into `search` — `@real-router/persistent-params-plugin` since #1563 — is now schema-checked on `navigate` as well as on the URL→State direction. Before this, exactly one direction was covered, and which one flipped with #1563.
- Validated values are written back to the bag they came from, so an undeclared key still rides where core puts it (#1553 untouched); a key the schema invents lands in `search`.
- Recovery after issues fills from the route's query-channel defaults: `defaultSearch` (the M2 home) and a `defaultParams` entry for a declared query key, minus the path slots.
