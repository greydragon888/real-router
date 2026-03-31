---
"@real-router/types": minor
---

Add `NumberFormat` type for numeric query parameter parsing (#383)

New `NumberFormat` type (`"none" | "auto"`) and `numberFormat` field in `QueryParamsOptions`. Resolves the asymmetry where `booleanFormat` existed but numeric values had no equivalent option.
