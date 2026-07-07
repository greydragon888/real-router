---
"@real-router/core": patch
---

search-params: type-doc sync and an index-scalar behavior lock (#1319).

No runtime change. The `numberFormat: "auto"` JSDoc on `NumberFormat` (shipped in the `.d.ts`) now notes that `-0` is rejected — the grammar regex matches it, but an `Object.is` guard keeps it a string so `parse(build(x)) === x` holds (#898). Internal docs corrected alongside: ARCHITECTURE cited `parse()` where `route-tree` injects `parseQuery` (#1292), and INVARIANT #17 + a functional test now lock that an indexed group displaces a bare scalar for the same key (`parse("a=1&a[0]=x", { arrayFormat: "index" })` → `{ a: ["x"] }`).
