---
"@real-router/core": patch
---

Surface an invalid-regex constraint body through the validation gate's route-contextual error (#1324)

The invalid-constraint-body fix made `buildParamMeta` reject a body that is not a valid regular expression (`/:id<*x>`, `/:id<(>`, `/:id<[>`) with a plain `Error` instead of a raw V8 `SyntaxError`. But route-tree's validation gate (`validateRoutePath`, used by `@real-router/validation-plugin`) calls `buildParamMeta` early, so that plain `Error` leaked straight through the gate — the one malformed-path class that escaped the gate's contract, where every other reject throws a route-contextual `TypeError` (`[router.add] Invalid path for route "x": …`). The gate now wraps the `buildParamMeta` call, so an invalid-regex constraint body surfaces as the same route-contextual `TypeError` as every other malformed path, carrying the route name and method. A valid body (`<\d+>`, `<[a-z]+>`) is unaffected.
