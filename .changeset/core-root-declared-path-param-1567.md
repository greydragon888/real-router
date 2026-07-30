---
"@real-router/core": minor
---

Substitute a param declared on the root path (#1567)

`setRootPath("/app/:tenant")` registered and **matched** fine, but the build side
never substituted the slot — the literal `:tenant` stayed in every URL and the
value leaked into the query string as a loose extra:

```ts
getPluginApi(router).setRootPath("/app/:tenant");

router.buildPath("home", { tenant: "t1" });
// before: "/app/:tenant/home?tenant=t1"
// now:    "/app/t1/home"
```

Because matching *did* extract the param, the broken string was committed:
`matchPath("/app/t1/home")` and `start(...)` both produced `state.path ===
"/app/:tenant/home"`, which under a URL plugin reached the address bar. A missing
value was not reported either — `buildPath("home", {})` returned the literal
instead of throwing `Missing required param`. Both are correct now.

Same root-blindness as **#1556**, one layer over: the root node is deliberately
absent from a route's `matchSegments`, so anything derived from a segment walk
misses it. #1556 fixed the query-declaration side; the build template gathered its
param names the same way, found none, and took the "no params here" fast path that
emits the whole path as static text. The root's path params (and splat names, so a
root splat keeps its separators instead of percent-encoding them) now travel
alongside its query declarations into registration.

Static root paths (`setRootPath("/app")`) and routes with their own params are
unaffected.
