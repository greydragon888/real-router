---
"@real-router/validation-plugin": patch
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

The check is now `Number.isInteger`, which lands both mirrors on one predicate —
`validateLimitValue` already used it on the neighbouring path. The thrown
message reads `must be an integer, got NaN` where it previously read
`must be a number, got undefined`.

⚠ `Number.isInteger` is strictly stronger than `typeof === "number"`: it also
rejects `±Infinity` and any float. **No install outcome changes for those** —
`validateLimitValue` already refused them a few lines later, so `Infinity` as a
spelling of "no cap" was never installable with this plugin. What changes is
which of the two mirrors speaks first, and therefore the message: for a
non-integer numeric limit you now get
`[validation-plugin] validateDependenciesStructure: deps.limits.<name> …`
instead of `[router.constructor (retrospective)] limit "<name>" …`. For roughly
a dozen other shapes the flip runs the other way and the message improves. If
you match on these strings, they moved.

**Who is affected:** anyone whose config can produce a non-integer limit — a bag
from `JSON.parse`, an environment variable, or a value assembled at runtime.
What returns is the plugin's refusal at install for the `NaN` half.

⚠ The router's own behaviour is unchanged for `NaN` specifically (`NaN` and
`undefined` both compare false, so neither caps). It is **not** unchanged for
the whole population named above: `null`, `""`, `false` and `[]` used to make
every `subscribe()` throw on bare core and now mean "no cap" — that half is the
core change, described in its own changeset.
