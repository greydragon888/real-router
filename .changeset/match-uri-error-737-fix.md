---
"@real-router/core": patch
---

Stop `start()` crashing on valid-hex/invalid-UTF-8 percent sequences (#737)

`SegmentMatcher.match()` threw a `URIError` on a percent sequence that is
syntactically valid (`%XX` with hex digits) but semantically invalid UTF-8
(e.g. `%E0%41`, `%C0%80`, `%FF`). `validatePercentEncoding` only checks `%XX`
syntax, so `decodeURIComponent` later threw — and through core, `router.start()`
crashed and left the router inactive instead of resolving the unmatched URL.

```js
const r = createRouter([
  { name: "users", path: "/users", children: [{ name: "p", path: "/:id" }] },
]);
await r.start("/users/%E0%41"); // before: throws URIError; after: ROUTE_NOT_FOUND / UNKNOWN_ROUTE
```

`match()` now honors its never-throw contract: a `URIError` during param
decoding (`#decodeParams`) or query parsing (`#buildResult`) makes `match()`
return `undefined`, so the router resolves to `UNKNOWN_ROUTE` (with
`allowNotFound`) or rejects with the normal `ROUTE_NOT_FOUND` instead of
crashing. The query path (`?x=%E0%41`) had the same gap via the injected
parser and is fixed too. Behavior is unchanged for all valid URLs.
