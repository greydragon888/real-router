---
"@real-router/rsc-server-plugin": patch
---

Compare hydration payload values the way core compares states (#2918)

The post-hydration skip compares each `params` / `search` value of the payload with the state the client commits by core's `areParamValuesEqual`, the comparison `areStatesEqual` makes, instead of `===` (element by element for an array).

- Under the in-memory handoff, a `Date` or a plain object a route codec decodes agrees with the client's own decode: `state.context.rsc` holds the server's value, and the loader no longer runs again.
- `9` agrees with `"9"`, and `["a"]` with `"a"`: each pair prints one URL.
- A payload that crossed a serializer agrees on an object value only when the serializer gives it back in its own type: JSON gives a `Date` back as its ISO string.
- An object core has no key for, such as a `Set`, compares by identity and never agrees.
