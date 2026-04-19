---
"@real-router/search-schema-plugin": patch
---

Document schema ↔ format coercion in README (#465)

Added "Schema ↔ Format Coercion" section explaining:

- The plugin validates decoded (typed) values, not raw URL strings
- How `queryParams` options (booleanFormat, numberFormat, arrayFormat) interact with schema types
- Gotcha: `z.boolean()` with `booleanFormat: "none"` breaks because schema receives strings
- Workaround: `z.coerce.boolean()` / `z.coerce.number()` for mismatched configs
- Recommended baseline: keep `queryParams` defaults for typical Zod/Valibot schemas

Cross-reference to `@real-router/core` Params Contract section.
