---
"@real-router/hash-plugin": patch
---

Clarify the `getRouteFromEvent` matchPath-fallback JSDoc in shared `popstate-utils` — name hash-plugin's `buildHashLocation(location.hash, ...)` mechanism so the comment (read by both URL plugins' maintainers) correctly explains why the fallback resolves the hash route (#760)
