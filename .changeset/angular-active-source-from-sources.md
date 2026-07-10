---
"@real-router/angular": patch
---

refactor(angular): import `createActiveSource` from `@real-router/sources` (#1416)

The fast/slow active-source builder moved to `@real-router/sources` (one shared
copy for all adapters). `RealLink` and `RealLinkActive` now import
`createActiveSource` from there; the local `internal/createActiveSource.ts` copy
(and its test) is removed. No behavior change — the builder's logic and signature
are unchanged (`buildActiveRouteOptions` stays for `injectIsActiveRoute`).
