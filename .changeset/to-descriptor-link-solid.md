---
"@real-router/solid": minor
---

`<Link to={NavigationTarget}>` descriptor prop — RFC-4 M2 B2 (#1548)

`<Link>` gains a `to={{ name, params?, search? }}` descriptor form, mutually
exclusive with the channel props (`routeName`/`routeParams`/`routeSearch`).
`LinkProps` is now a discriminated union — mixing the two forms is a compile
error; at runtime the shared `resolveLinkTarget` helper enforces it (`to` wins,
dev-warn on conflict). `routeOptions`/`hash` stay separate under both forms.
