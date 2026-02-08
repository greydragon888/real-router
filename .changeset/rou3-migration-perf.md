---
"@real-router/core": minor
---

Migrate routing engine to rou3 and optimize path building (#40)

**BREAKING CHANGES:**

- Encoding mode `legacy` has been removed. Use `uri` instead (1:1 equivalent).
- `children.values()` iteration order now follows definition order instead of routing priority order. This affects `routeTreeToDefinitions()` output order. Matching behavior is unchanged (handled by rou3 radix tree).

**Performance improvements:**

- Migrated to rou3 radix tree for 1000x+ faster route matching
- Optimized path building with standalone services (inject, validateConstraints, encodeParam)
- Replaced parser metadata access with lightweight paramMeta structure
- Removed dead sorting code (~50 lines) — no longer needed with rou3

**Migration:**

```typescript
// Before:
buildPath(tree, "route", params, { urlParamsEncoding: "legacy" });

// After:
buildPath(tree, "route", params, { urlParamsEncoding: "uri" });
```
