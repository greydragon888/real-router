---
"@real-router/core": minor
---

Add `numberFormat` option to router query params (#383)

New `numberFormat` option (`"none"` | `"auto"`) in `queryParams` configuration. When set to `"auto"`, numeric query parameter values (e.g. `?page=1&price=12.5`) are automatically parsed as numbers instead of strings. Defaults to `"none"` (no behavior change).
