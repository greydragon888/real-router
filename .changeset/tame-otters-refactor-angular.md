---
"@real-router/angular": patch
---

Refactor internal `buildHref` DOM helper to a positional hash argument (#1442)

`buildHref(router, name, params, hash?)` now takes the hash fragment positionally instead of wrapping it in an options object, mirroring the existing `navigateWithHash(router, name, params, hash)` signature and simplifying the `RealLink` href `computed`. Internal-only helper — the git-tracked `src/dom-utils/` copy is kept byte-identical to `shared/dom-utils/`. No public API surface or runtime behavior change; rendered hrefs are identical.
