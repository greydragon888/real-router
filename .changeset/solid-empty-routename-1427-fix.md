---
"@real-router/solid": patch
---

fix(solid): `<Link routeName="">` is inactive, matching `router.isActiveRoute("")` (#1427)

Solid's `<Link>` resolved default-options active state through the per-router
`routeSelector` (`createSelector` + `isRouteActive`), whose unstarted sentinel
(`routeSignal().route?.name ?? ""`) makes `isRouteActive("", "") === true` — so a
misused empty-name Link lit up **before `router.start()`**, diverging from the
canonical `router.isActiveRoute("") === false`. (A started router was already
correct — `isRouteActive("", "<route>")` is `false` — so this closes only the
unstarted/stopped window.) `useFastPath` now guards `routeName !== ""`, routing an
empty name to the slow `createActiveRouteSource`, which reads
`router.isActiveRoute("")` in every router state. This aligns solid with the other
five adapters (#1416/#1424 · #1427). The `isRouteActive` helper and its property
locks are unchanged. No change for any non-empty name.
