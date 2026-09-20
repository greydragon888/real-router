---
"@real-router/core": patch
---

Logger channels name the call you made, not the class that logged it (#2461)

The issue read the `clear` door as naming itself two ways and expected the longer
name to be the outlier. The census answered the other way: core names that door
`clearRoutes` everywhere it names it — the in-flight log channel at
`routeGuards.ts:247`, the wiki page — the way `add` is `addRoute` and `update` is
`updateRoute`. The refusal raised by `getRoutesApi` was the only site saying
`[router.clear]`, so the throw is what changed.

Three logger channels changed with it, for the reason [#1845](https://github.com/greydragon888/real-router/issues/1845) gave for throw prefixes: a
channel that names a class or the package tells a reader nothing they can grep in
their own code or look up in the wiki.

| site                                     | before           | after                  |
| ---------------------------------------- | ---------------- | ---------------------- |
| `getRoutesApi` — clear refusal           | `[router.clear]` | `[router.clearRoutes]` |
| `Router` — listener error sink           | `Router`         | `router`               |
| `Router` — `isActiveRoute("")`           | `real-router`    | `router.isActiveRoute` |
| `routesStore` — two `forwardTo` warnings | `real-router`    | `router`               |

The two that become bare `router` keep it deliberately: the listener sink reports
an error raised in application code from any event, and the `forwardTo` warnings
fire during registration, which `createRouter`, `add` and `replace` all reach. A
single door name would be false at the others.

⚠ **The channel is observable surface, not an internal label.** `RouterLogger`
renders it as `[channel] message` on the console and passes it verbatim as the
second argument of the `callback` a consumer installs, so an application filtering
its own logs filters on exactly this string. Two cells in `cloneRouter.test.ts`
asserted `"real-router"` through that public callback, which is how the surface
proved itself.

What keeps the convention is a walk over `packages/core/src`, not this table:
`logger-channel-authority-2461.test.ts` fails on a channel that is neither `router`
nor `router.<door>`. It reads its level set off `RouterLogger` rather than listing
levels — a hand-written set carried three the class does not publish and missed
`log`, which it does, and that hole would have hidden a `logger.log("Router", …)`
from the walk entirely. Measured across `packages/*/src` and `shared/`: 21 literal
channels, four outside the shape before this change and none after.
