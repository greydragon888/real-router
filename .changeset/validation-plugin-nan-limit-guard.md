---
"@real-router/validation-plugin": minor
---

fix: catch a `NaN` limit in `validateDependenciesStructure` (#1875)

`validateDependenciesStructure` tested each limit with `typeof !== "number"`.
That predicate was written when the router handed the plugin the caller's raw
value, so a limit spelled `undefined`, `"abc"` or `{}` was caught by it.

Core now coerces `limits` once at construction, which means every value in that
store is `typeof "number"` before the plugin ever sees it — and `Number(x)` for
each of those inputs is `NaN`, which is a number. The check therefore stopped
diagnosing the exact population it existed for: measured, a router built with
`{ limits: { maxListeners: undefined } }` was refused at install before the
coercion moved upstream and installed clean after it.

The check is now `Number.isInteger`, which is the predicate `validateLimitValue`
already used on the neighbouring path, so the two mirrors agree. The thrown
message reads `must be an integer, got NaN` where it previously read
`must be a number, got undefined`.

**Who is affected:** anyone whose config can produce a non-numeric limit — a bag
from `JSON.parse`, an environment variable, or a value assembled at runtime.
The router's own behaviour for such a limit is unchanged in both versions (`NaN`
and `undefined` both compare false, so the limit does not cap); what returns is
the plugin's refusal at install.
