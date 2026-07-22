---
"@real-router/svelte": minor
---

`<Link to={NavigationTarget}>` descriptor prop — RFC-4 M2 B2 (#1548)

`<Link>` gains a `to={{ name, params?, search? }}` descriptor form, mutually
exclusive with the channel props (`routeName`/`routeParams`/`routeSearch`).
Svelte's `[key: string]` index signature on `LinkProps` precludes a strict
never-union, so the exclusion is a runtime contract via the shared
`resolveLinkTarget` helper (`to` wins, dev-warn on conflict). `routeName` is now
optional (was required). `routeOptions`/`hash` stay separate under both forms.
