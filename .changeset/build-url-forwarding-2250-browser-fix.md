---
"@real-router/browser-plugin": minor
---

`router.buildUrl` resolves `forwardTo`, and the popstate rollback stops rebuilding from a name (#2250)

Two doors in this plugin asked `router.buildPath` for a URL. `buildPath` is the
LITERAL form by record — it answers about the route it was NAMED — so both
disagreed with where a navigation actually lands.

- **`buildUrl`** (the door every `<Link>` reaches through a URL plugin) now
  builds from `buildNavigationState`, the same door `replaceHistoryState` has
  taken since #1585. An unknown route still throws: the `??` keeps
  `router.buildPath` as the failure shape.
- **`rollbackUrlToCurrentState`** takes the committed state's own `path` and
  asks the plugin only to prefix it. The rebuild ran the `forwardState` seam a
  second time on an already-resolved state, and on the 404 arm it was simply
  wrong: a state named `@@router/UNKNOWN_ROUTE` builds an EMPTY path, so rolling
  back from an unmatched URL replaced the address with `""` or the bare base.

`PopstateHandlerDeps.buildUrl` is replaced by `pathToUrl: (path: string) =>
string` — a single argument has no slots to reslot, which is the #1586 class of
defect made unconstructible.

⚠ **A second divergence closes with it.** The channel guard (#1572) has always
thrown on the click when a route's declared query name is handed in the PATH
bag; `router.buildPath` answers the literal path, so the URL this builder
produced was a working address for an intent that could not commit. Asking the
resolving door makes this builder throw there too — `<Link routeName="q"
routeParams={{ page: "2" }}>` on a route declaring `?page` now renders no href
instead of one its own click refuses. The fix is the same it always was: pass it
in `routeSearch`.
