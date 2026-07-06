---
"@real-router/core": patch
---

Keep a legal "?" inside a query value (#1292)

`SegmentMatcher` already splits the URL at the first "?" before handing the query substring to the search-params parser, but `parse()` re-ran `getSearch()` and split it again — so a "?" inside a query value (legal per RFC 3986) silently dropped the parameter, and under `queryParamsMode: "strict"` unmatched the whole URL (`matchPath("/r?x=a?b")` → `{ b: null }`; strict `matchPath("/s?q=a?b")` → `undefined`). search-params now exposes `parseQuery` (parse an already-extracted query, without `getSearch`), and route-tree's matcher wires that into the DI — so the URL is split exactly once and the value keeps its "?".
