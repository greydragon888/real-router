---
"@real-router/svelte": patch
---

Speed up `<Link>` mount via a shared active-name selector fast path (#1099)

A default-options `<Link>` (non-strict, query params ignored, no custom
`routeParams`, no `hash`) now resolves its active state through the per-router
`createActiveNameSelector` — a single shared `router.subscribe` handle for any
number of distinct-`routeName` links — instead of allocating a per-link
`createActiveRouteSource` (a `BaseSource` plus its own router subscription for
every link).

This mirrors the Solid adapter's `routeSelector` fast path. On the `link-build`
benchmark (mount 1000 `<Link>`s) it removes the per-link source setup that was
the bulk of the Svelte `<Link>`'s excess cost — ~14.5 → ~12.6 ms / 1000 links —
and collapses 1000 router subscriptions down to one. Active-class behaviour is
unchanged (non-strict, query-ignoring, name-only matching is exactly what the
default `createActiveRouteSource` did); links needing custom params, strict
matching, `ignoreQueryParams: false`, or hash-aware (#532) matching keep the
full-fidelity slow path.
