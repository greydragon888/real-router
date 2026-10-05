---
"@real-router/solid": patch
---

An empty or absent `routeName` lights no `<Link>` up before `router.start()` (#1427)

A `<Link>` given no route name at all — only a JS caller can write one, the types require `routeName` or `to` — or one whose `routeName` was unset to `""` or `undefined` after it mounted, was marked active while the router was unstarted. The Link now answers an empty or absent name itself, as `false`, in every router state, as `router.isActiveRoute("")` does.
