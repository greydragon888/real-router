---
"@real-router/core": patch
---

Drive cloneRouter/cloneConfig config copy by a single enumeration (#965)

Internal refactor — no public API or behavior change. The per-route
`RouteConfig` sub-maps were copied with one `Object.assign` per field in two
places (`cloneRouter` and `cloneConfig`), so a newly added sub-field could be
silently missed at either site. Both now go through a shared
`assignConfigEntries(target, source)` helper that enumerates the config keys, so
a new sub-field is carried over automatically.
