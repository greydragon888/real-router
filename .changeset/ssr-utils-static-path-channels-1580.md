---
"@real-router/ssr-utils": minor
---

Give `getStaticPaths` entries two channels, and refuse a key that cannot reach the URL (#1580)

`StaticPathEntries` was single-bag by construction, and every bag went to the
PATH channel. Since `buildPath` stopped printing a query string out of the params
bag (nav-pipeline Phase 2, #1548), any entry set that varied a QUERY param
produced the same URL for every variant — the SSG manifest silently lost pages:

```ts
// Route: /list?sort&page
entries = { list: async () => [{ sort: "asc" }, { sort: "desc" }] };
await getStaticPaths(router, entries);
// before this fix: ["/list", "/list"]   ← two entries, one page
```

**An entry now names its channels** — `{ params?, search? }`, both optional:

```ts
entries = {
  list: async () => [
    { search: { sort: "asc", page: "1" } },
    { search: { sort: "desc", page: "1" } },
  ],
  doc: async () => [{ params: { id: "a" }, search: { rev: "1" } }],
};
```

Breaking for anyone on the flat form: wrap it in `params`
(`{ id: "1" }` → `{ params: { id: "1" } }`). There is deliberately no
single-bag alternative — which channel a key belongs to is the caller's contract
everywhere else in the router (`navigate` throws on a declared query name handed
in the path bag), a flat bag cannot express it, and keeping it would have kept
the shape that caused the bug.

**And a key that does not reach the URL now fails the build** rather than
collapsing pages, because the type cannot catch every case — the wrong channel
(`{ params: { sort } }` for a `?sort`) and a key the route declares nowhere (the
mode gate drops it under `default` / `strict`) both still type-check:

```
[getStaticPaths] Route "list" built "/list", which does not carry `sort`.
Every entry differing only in that key generates the same page, so the manifest
silently loses the rest. …
```

The check asks the URL, not the route's declarations, and that is load-bearing:
the registry deciding a key's channel is the one that PRINTS (#1556), so
re-deriving it here would drift from it. Reading `paramMeta.queryParams` off the
leaf node was measured wrong three ways — it reports the `/items/:id?id`
collision as a query name (core excludes it, #843/#1549) and it sees neither an
ancestor's `?q` nor a `setRootPath("?lang")` declaration. Matching the built URL
back sees all three and adapts to `queryParamsMode` for free. It compares
PRESENCE, not values, so a route's `encodeParams` may still rewrite a value on
the way out. Cost is ~0.5 µs per entry — 5 ms per 10 000 pages, on a build step —
and entries that supply nothing skip it entirely.
