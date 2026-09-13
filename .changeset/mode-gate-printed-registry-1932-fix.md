---
"@real-router/core": minor
---

The mode gate reads the registry that PRINTS, not the one that classifies (#1932)

Under `queryParamsMode: "default"` or `"strict"`, a route declaring the same name
as both a path slot and a query param — `/items/:id?id` — lost the query twin.
`buildPath("items", { id: "1" }, { id: "Q" })` printed `/items/1` while the URL
build was ready to print `?id=Q`, and `state.search` came back without the key.

One registration, two questions. `getQueryParams` subtracts the route's path
slots and answers **which channel owns a key**; the query-string build prints
from the declarations UNSUBTRACTED. The gate was reading the first while
enforcing a promise about the second, so on the one route shape where the two
disagree it dropped a key the build then printed — breaking
`keys(state.search) ⊆ keys(matchPath(state.path).search)`, the very invariant it
exists for.

The pipeline port grows `printedQueryNames` beside `queryNames`, wired to a new
`RoutesNamespace.getPrintedQueryParams` that hands over the matcher's own frozen
array. `loose` short-circuits before the gate and reads neither.

Measured on `buildPath` under `strict`, alternating rebuilt bundles, medians of
13 rounds × 4 pairs: the added port hop costs **+0.4 %** against a 1.7–7.2 %
noise floor, and `loose` does not move. The collision arm is 13.6 % slower for a
different reason — it now prints one more key.
