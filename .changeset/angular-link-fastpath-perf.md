---
"@real-router/angular": patch
---

Speed up `RealLink` / `RealLinkActive` mount via a shared active-name selector fast path (#1103)

A default-options `RealLink` / `RealLinkActive` (a non-empty `routeName`, no
custom `routeParams`, non-strict, query params ignored, no `hash`) now resolves
its active state through the per-router `createActiveNameSelector` — a single
shared `router.subscribe` handle for any number of distinct-`routeName` links —
instead of allocating a per-link `createActiveRouteSource` (a `BaseSource` plus
its own router subscription for every link). Because `activeClassName` defaults
to `"active"`, *every* `RealLink` tracked active state by default, so a
link-heavy page opened one router subscription per link.

The path decision lives in the new internal `createActiveSource` helper; the
selector is wrapped as a `RouterSource<boolean>` so the directives' existing
`subscribeSourceToSignal` pipeline is unchanged. This ports the Svelte adapter's
fix ([#1101](https://github.com/greydragon888/real-router/pull/1101)) to Angular.
On the `link-build` benchmark (mount 1000 links) it removes the per-link source
setup — ~14.8 → ~12.9 ms / 1000 links — and collapses 1000 router subscriptions
to one.

Active-class semantics are unchanged (non-strict, query-ignoring, name-only
matching is exactly what the default `createActiveRouteSource` did). Any
deviation from the defaults — custom `routeParams`, `activeStrict`,
`ignoreQueryParams: false`, hash-aware (#532), **or an empty `routeName`** (a
misuse where the selector's root-active semantics would differ) — keeps the
full-fidelity per-link slow path.
