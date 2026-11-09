---
"@real-router/ssr-data-plugin": patch
---

Compare hydration payload values the way core compares states (#2918)

The post-hydration skip compares each `params` / `search` value of the payload with the state the client commits by core's `areParamValuesEqual`, the comparison `areStatesEqual` makes, instead of `===` (element by element for an array).

- A plain object a route codec decodes, such as a JSON filter, agrees with the client's own decode: `state.context.data` holds the server's answer, and the loader no longer runs again on the client.
- `9` agrees with `"9"`, and `["a"]` with `"a"`: each pair prints one URL.
- A value whose type the serializer changes still disagrees, and the loader runs: JSON gives a `Date` back as its ISO string. To reuse the server's data for such a route, pass a serializer pair that revives it — `serialize` on `serializeRouterState` with the matching `deserialize` on `hydrateRouter`, such as devalue's.
- An object core has no key for, such as a `Set`, compares by identity and never agrees.
