---
"@real-router/core": patch
---

Fix query keys that shadow `Object.prototype` members corrupting parsed params (#855)

A query parameter whose name matched an inherited `Object.prototype` member
(`valueOf`, `constructor`, `toString`, `hasOwnProperty`, …) was mis-detected as a
pre-existing value during parsing, corrupting the result into
`{ valueOf: [<function>, "x"] }`. A literal `__proto__` key was silently dropped.

Collision detection now uses `Object.hasOwn`, and assignment uses `defineProperty`
for `__proto__`, so such keys decode to plain own properties:

- `?constructor=x` → `{ constructor: "x" }` (was `{ constructor: [<fn>, "x"] }`)
- `?__proto__=x` → `{ __proto__: "x" }` as an own property (was dropped)

Found via property-based testing of key encoding.
