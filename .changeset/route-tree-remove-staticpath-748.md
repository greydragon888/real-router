---
"@real-router/core": patch
---

Remove the dead `staticPath` cache from `RouteTree` (#748)

Internal cleanup. `RouteTree.staticPath` was computed at build time but read by no
runtime consumer — the matcher recomputes its own static paths — and it held a
wrong value for a static route nested under a pathless grouping node (e.g.
`b.staticPath` was `"/b"` instead of `"/a/b"` for `/a` → `""` → `/b`). Matching
never read it, so runtime behavior is unchanged; the unused, latent-buggy field
is gone.

The field is removed from the `RouteTree` type exposed via
`getPluginApi(router).getTree()`. Nothing reads it in practice; if you derived a
URL from `node.staticPath`, build it from `node.path` / the route chain or use
`router.buildPath(name)`. Also drops `computeStaticPath`/`joinPaths` per-build
work and a few hundred bundle bytes, and retires invariant CC1.
