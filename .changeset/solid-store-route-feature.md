---
"@real-router/solid": minor
---

Add `useRouteStore()` and `useRouteNodeStore()` for granular property-level reactivity (#326)

New store-based hooks using `createStore` + `reconcile` from `solid-js/store`. Components reading specific nested properties (e.g., `state.route?.params.id`) only re-run when those properties change — not on every navigation.
