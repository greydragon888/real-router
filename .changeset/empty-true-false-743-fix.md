---
"@real-router/core": minor
---

Fix `booleanFormat: "empty-true"` losing `false` to a string (#743)

With `booleanFormat: "empty-true"`, `build({ flag: false })` emits `"flag=false"`
but `parse` returned the string `"false"` instead of boolean `false`, so the value
did not round-trip. The strategy's decode now recognizes both `"true"` and `"false"`
as booleans, mirroring its encoding.

- `parse("flag=false", { booleanFormat: "empty-true" })` → `{ flag: false }` (was `{ flag: "false" }`)
- Array elements carry explicit values (`"a=true&a=false"`); both now decode back
  to booleans, removing the `false`→bool / `true`→string asymmetry
- Scalar `true` is still key-only (`?flag`) and decodes to `true`

Breaking for code that relied on `empty-true` params being read as the strings
`"true"`/`"false"`.
