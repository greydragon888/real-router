---
"@real-router/core": patch
---

Remove dead `store.treeOperations` indirection (#909)

`getRoutesApi` now calls `commitTreeChanges` / `resetStore` / `nodeToDefinition` via direct static imports instead of a per-store `treeOperations` object. The indirection's stated rationale (avoid static `route-tree` import chains) no longer held — `route-tree` is always bundled into core. Internal only; no API or behavior change.
