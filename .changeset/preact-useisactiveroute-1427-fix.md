---
"@real-router/preact": patch
---

fix(preact): `useIsActiveRoute("")` is inactive, matching `router.isActiveRoute("")` (#1427)

`useIsActiveRoute` kept an inline copy of the fast/slow active-source decision
whose predicate lacked the `routeName !== ""` guard, so an empty `routeName` took
the name-selector fast path — where `isActive("") === true` (the root is every
route's ancestor) — and wrongly reported active, diverging from the canonical
`router.isActiveRoute("") === false`. The hook now delegates to the shared
`createActiveSource` builder from `@real-router/sources`, whose guard routes an
empty name to the slow path. No change for any non-empty name — the fast/slow
decision and behaviour are otherwise identical (the `#1249` fast path is now the
one in the shared builder).
