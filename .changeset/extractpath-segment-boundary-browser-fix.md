---
"@real-router/browser-plugin": patch
---

Fix `extractPath` matching non-segment-boundary base prefix (#446)

`extractPath("/application/users", "/app")` incorrectly stripped the base, returning `/lication/users`. Now enforces `/`-delimited segment boundaries: only exact match (`pathname === base`) or segment-boundary match (`pathname.startsWith(base + "/")`) triggers stripping.
