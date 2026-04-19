---
"@real-router/core": patch
---

Document the public `params` contract in README (#465)

Added explicit documentation of how `navigate()` and `buildPath()` handle each value type in `params`:

- `undefined` → stripped (documented contract, not implementation detail)
- `null` → `?key` (key-only)
- `""` → `?key=` (explicit empty value, distinct from `null`)
- Falsy-but-defined values (`0`, `false`, `""`) preserved
- Number and boolean auto-coercion on parse

Tables for input (`params` object) and output (URL → `state.params`) semantics.

Cross-references to `search-params` and `search-schema-plugin` README for configuration and schema integration.
