---
"@real-router/core": patch
---

Fix constraint on an omitted optional param being tested against `undefined` (#1148)

`route.constraintPatterns` is collected across all segments, including optional params. On the omit branch the param is never captured, so `#validateConstraints` ran `constraint.pattern.test(params[paramName])` with `params[paramName] === undefined` → coerced to the string `"undefined"`. Whether the omit form of the route matched then depended on whether the constraint regex happened to match `"undefined"`: `/search/:query<\d+>?` matching `/search` returned `undefined` (unroutable), while `<\w+>?` matched by accident.

Fix: `#validateConstraints` now skips a constraint when its param is absent from `params` (`Object.hasOwn`), so an omitted optional is not constraint-checked — symmetric with the build side (`#validateBuildConstraints` already skipped absent params). The constraint still applies when the param is present.
