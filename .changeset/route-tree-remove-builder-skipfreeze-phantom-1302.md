---
"@real-router/core": patch
---

Remove core-unreachable API (#1302): `createRouteTree` now inlines the former standalone `createRouteTreeBuilder` (removed) and always freezes — the `skipFreeze` `TreeBuildOptions` is gone and `computeCaches` loses its `freeze` param. Also drops the phantom option types `MatchOptions` / `BuildOptions` / `BasePathOptions` / `TrailingSlashMode` (+ orphaned `QueryParamsMode`), which described options that were never implemented. Deliberate surface reduction of this private package.
