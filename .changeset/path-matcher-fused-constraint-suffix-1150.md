---
"@real-router/core": minor
---

Reject static text fused to a constraint at registration instead of shipping a silent dead route (#1150)

A `:name<…>` constraint immediately followed by static text in the same segment — `/:year<\d+>-archive`, `/post/:id<\d+>.html` — passed every gate but compiled to an unreachable route: `buildPath` threw `Missing required param` and `match` returned `undefined`. The build side re-extracts the param name greedily and fused the post-`>` text onto it (name `year-archive`), desyncing from meta (name `year`). Registration now throws with a hint (`use "/:id<...>/rest", not "/:id<...>rest"`) — the mirror of the fused-marker (#1050) / optional-splat (#1149) rejections, on the other side of the param. `@real-router/validation-plugin`'s `addRoute` rejects it too, with a route-contextual message.
