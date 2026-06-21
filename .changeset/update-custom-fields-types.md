---
"@real-router/types": patch
---

Document `RouteConfigUpdate` custom-field patch semantics and augmentability (#797)

`RouteConfigUpdate` now documents that `routes.update()` patches plugin-defined
custom fields (shallow-merge by key, `null` removes, `undefined` is a no-op) and
that the interface is augmentable — a plugin declares its updatable field via
declaration merging, mirroring its `Route` augmentation but with `| null` to
allow removal. The interface stays closed (no index signature), so typos in
structural field names remain compile errors.
