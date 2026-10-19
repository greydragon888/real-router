---
"@real-router/core": patch
---

A splat value with an empty segment builds a path the router matches back (#2758)

`buildPath` printed every `/` of a splat value as is, so a value with an empty segment — `{ rest: "/x" }`, which `matchPath("/%2Fx")` returns — built `//x`, a path `matchPath` refuses. Under `urlParamsEncoding: "default"` and `"uriComponent"` the separator after an empty segment is printed `%2F`: `{ rest: "/x" }` builds `/%2Fx`, and `matchPath("/%2Fx")` keeps that path in `state.path`. `"uri"` and `"none"` keep the `/`, since their decoding cannot turn `%2F` back into it.
