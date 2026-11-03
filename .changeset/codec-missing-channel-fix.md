---
"@real-router/core": patch
---

Fill a channel a route codec leaves out of its return with the channel the codec was handed (#2896)

An `encodeParams` / `decodeParams` that returns only `{ params }` or only `{ search }`, or `null` for one of them, no longer loses that channel. A nullish return of the whole object already fell back to the input; a nullish channel now does too.

- `buildPath` and `navigate` print the query from the `search` the encoder was handed. Before, it was rebuilt from the path bag: `/items/:id?id&q` printed `?id=5` for `{ id: "7", q: "x" }`, and `queryParamsMode: "loose"` printed a params-only key. The committed `state.path` now agrees with `state.search`.
- The URL `matchPath` rebuilds under `rewritePathOnMatch` takes the same fallback.
- An encoder that returns no `params` builds the path from the caller's params instead of throwing `Missing required param`.
- A decoder that returns no `search` keeps the parsed query in `state.search` and in the rebuilt `state.path`; one that returns no `params` keeps the matched path params.
- With `@real-router/validation-plugin`, a decoder that returns no `params` is still refused with `Invalid routeParams`.
