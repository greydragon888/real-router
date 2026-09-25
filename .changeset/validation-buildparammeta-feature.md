---
"@real-router/core": minor
---

`@real-router/core/validation` exports `buildParamMeta` (#2569)

`buildParamMeta(path)` returns the params a route path declares: `urlParams`
for its `:param` and `*splat` slots and `queryParams` for its `?query`
declarations, beside `paramTypeMap` and `pathPattern`. Core builds each
registered route's param metadata with it, from the path with a leading `~`
removed, and `getUrlParams` answers from that. A segment the path grammar
refuses (a fused marker such as `a:b`) contributes nothing, so read a path
`validateRoute` accepts.

`@real-router/validation-plugin` reads a route it has not registered yet with
it, so a forward's two ends are read by one grammar. The subpath carries it for
the reason it carries `findMisChanneledKey`: a second copy of the rule drifts.
