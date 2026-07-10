---
"@real-router/react": patch
---

Un-ignore the reachable `useRouteEnter` `previousRoute` guard + lifecycle doc corrections (#1218, #1219)

The mount-side `!previousRoute` guard in `useRouteEnter` was marked StrictMode-only and v8-ignored, but it is reachable and load-bearing on two real paths — a `RouterProvider` mounted after a navigation, and a React `<Activity>` catch-up reconcile — where the reconciled snapshot carries `previousRoute: undefined` and firing the handler would violate the non-nullable `RouteEnterContext.previousRoute` contract. The guard is now un-ignored and locked by regressions (PC1 functional, PC2 integration); behavior is unchanged.

Doc corrections (#1219): the stale "`createRouteSource` does not reconcile on re-subscribe" caveat is rewritten (the #765 reconnect reconcile landed, so `RouterProvider` under `<Activity>` reconciles on re-show — the placement note is now a style recommendation, not a footgun). Added a `useRouteExit` reentrancy note (a synchronous `navigate()` from an exit handler throws `REENTRANT_NAVIGATION` — defer past the sync dispatch) and an INVARIANTS pointer to the reactive-lifecycle regressions.
