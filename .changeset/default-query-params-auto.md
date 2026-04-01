---
"@real-router/core": minor
---

Change default `booleanFormat` and `numberFormat` to `"auto"` (#387)

**Breaking Change:** Default query parameter options now auto-detect types:
- `booleanFormat`: `"none"` → `"auto"` (`"true"`/`"false"` parsed as booleans)
- `numberFormat`: `"none"` → `"auto"` (numeric strings parsed as numbers)

Use `{ booleanFormat: "none", numberFormat: "none" }` to restore previous behavior.
