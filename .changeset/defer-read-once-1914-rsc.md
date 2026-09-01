---
"@real-router/rsc-server-plugin": patch
---

`defer()` reads the caller's deferred bag once, and ships what it validated (#1914)

This package bundles the same `shared/ssr/defer.ts` module, so the fix in its
sibling changeset is the same code here: one snapshot, validated and frozen, so
an accessor-backed bag cannot answer the validator and the payload differently.

⚑ `defer` is not in this package's public API, and this plugin configures no
deferred namespaces — so the reachable surface is a consumer that imports `defer`
from `@real-router/ssr-data-plugin` and returns it from an rsc loader. What
happens to such a payload here is #1917's subject, not this one's.
