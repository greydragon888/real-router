---
"@real-router/core": patch
---

Internal refactor: extract `update()`'s field-patch commit into `commitRouteUpdate` (#1049)

Co-locates `updateRoute`'s PREPARE/COMMIT logic in `routesStore.ts` beside the other three route-CRUD commit cores (`adoptRouteArtifacts`, `commitTreeChanges`, `resetStore`). `update` stays an O(1) field-patch (no tree rebuild), core reads each user `updates` getter exactly once, and all atomicity / guard-origin / custom-field semantics are unchanged. No public API or behavior change.
