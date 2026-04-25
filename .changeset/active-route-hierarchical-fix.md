---
"@real-router/core": minor
---

Fix two `isActiveRoute` bugs in the hierarchical (ancestor) branch (#536, #537)

- **`ignoreQueryParams` is now honored symmetrically** with the exact-match
  branch. When a parent route declares query-typed `defaultParams` (e.g.
  `path: "/products?sort"`, `defaultParams: { sort: "asc" }`) and a descendant
  state lacks the query value (e.g. `/products/6` → `params: { id: "6" }`), an
  ancestor link `<Link routeName="products" />` now correctly resolves as
  active under the default `ignoreQueryParams=true`. URL-typed defaults are
  still enforced; passing `ignoreQueryParams=false` keeps the strict behavior
  unchanged.
- **Descendant-of-active links no longer spuriously match.** When the link's
  `routeName` is a descendant of the active route name (e.g. you are on
  `/users`, the link points to `users.settings`), the link is no longer
  reported as active — it is a navigation option, not an active state.
  Standard ancestor-match semantics apply; only exact match and
  ancestor-of-active relations resolve to `true`.
