---
"@real-router/types": minor
---

Rename `BooleanFormat` value `"string"` to `"auto"` (#387)

**Breaking Change:** The `"string"` value of `BooleanFormat` type has been renamed to `"auto"` for symmetry with `NumberFormat`.

**Migration:**
```diff
- queryParams: { booleanFormat: "string" }
+ queryParams: { booleanFormat: "auto" }
```
