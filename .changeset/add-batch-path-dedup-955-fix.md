---
"@real-router/core": patch
---

Reject sibling routes sharing a path within a single `add()` batch (#955)

`getRoutesApi(router).add([...])` now throws `[router.addRoute] Path "<path>" is already defined` when two routes at the same parent level in one call share a `path`, instead of silently letting the matcher resolve the collision last-wins — which left the earlier route addressable by name (`has` / `buildPath`) but unreachable by URL (`matchPath` returned the later route). The guard runs before any build (atomic) and mirrors `@real-router/validation-plugin`'s message. Scoped to within-batch collisions (the case #955 describes); a path colliding with an already-registered route is unchanged here and still covered by the validation plugin.
