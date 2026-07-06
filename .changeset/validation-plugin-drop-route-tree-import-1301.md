---
"@real-router/validation-plugin": patch
---

Reach the routing engine only through `@real-router/core`, not `route-tree` (#1301)

The plugin no longer imports the foundation package `route-tree`: `validateRoute` now comes from the `@real-router/core/validation` subpath, and forwardTo segment lookup + existence use the matcher's own `getSegmentsByName` / `hasRoute` (the `RouteTree` / `Matcher` types come from core). `route-tree` is dropped from the plugin's devDependencies. Core is now the sole consumer of the routing engine; validation behaviour is unchanged. A package-level guard test prevents re-coupling.
