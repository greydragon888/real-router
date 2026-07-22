---
"@real-router/angular": minor
---

`[realLink] [to]` descriptor input — RFC-4 M2 B2 (#1548)

`RealLink` gains a `[to]="{ name, params?, search? }"` descriptor input, mutually
exclusive with the channel inputs (`routeName`/`routeParams`/`routeSearch`).
Directive inputs are independent signals (no union), so the exclusion is a
runtime contract via the shared `resolveLinkTarget` helper (`to` wins, dev-warn
on conflict). `routeOptions`/`hash` stay separate under both forms.
