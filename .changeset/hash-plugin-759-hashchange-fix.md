---
"@real-router/hash-plugin": minor
---

Sync the router on external URL fragment changes (#759)

hash-plugin now listens to `hashchange` in addition to `popstate`, so external fragment changes — a native `<a href="#/x">`, a manual address-bar hash edit, or `location.hash = "..."` from app/third-party code — synchronize the router. Previously only programmatic navigation (`<Link>` / `router.navigate`) and back/forward (popstate) were tracked; an external hash mutation updated the URL while the router stayed on the old route.

A hash-changing back/forward fires both `popstate` and `hashchange`; the two are deduped (order-independent, microtask-scoped) so exactly one navigation runs — never a double-navigate.

**Type note:** the exported `Browser` interface now requires `addHashChangeListener`. Code that supplies a hand-written `Browser` via the (test-only) `browser` factory argument must add this method.
