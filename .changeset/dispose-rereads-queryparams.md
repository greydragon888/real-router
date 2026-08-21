---
"@real-router/core": patch
---

fix(core): `dispose()` no longer re-reads the caller's `queryParams`, or throws (#1796)

`router.dispose()` reached `clearRoutes` → `resetStore` → `rebuildTreeInPlace` →
`createMatcher` → `makeOptions` → `resolveStrategies`, and that last step coerces
each `queryParams` format with `ToPropertyKey` to look it up. So a format
supplied as an object — supported input, the same class `opts` is documented to
allow — was read a SECOND time during teardown.

Measured, before: a `{ toString }` answering `"none"` and then `"bogusTypo"`
constructed cleanly, built the right URL, and made **`dispose()` throw** the
named config error. `dispose()` is idempotent by contract and is what `finally`
blocks call; a throw there discards whatever error was already travelling.

The snapshot taken when strategy resolution moved to matcher construction froze
the CONTAINER, so the bag could no longer be swapped between rebuilds — the
values inside it stayed live, and one slot could still answer twice. The four
format slots are now coerced to their string KEY at snapshot time, so the
caller's object is read exactly once per router, at construction, and every later
rebuild — `setRootPath`, `replace()`, `dispose()` — resolves from a string.

No config that was accepted is now refused, and none that was refused is now
accepted: `requireStrategy` sees the same key it would have computed itself. A
`symbol` format still throws by name, and now from `createRouter` rather than
from the first URL that carries a query.
