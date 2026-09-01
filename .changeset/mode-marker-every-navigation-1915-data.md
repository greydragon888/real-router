---
"@real-router/ssr-data-plugin": patch
---

The SSR mode marker is published on every navigation (#1915)

`getSsrDataMode(state)` answered `"full"` for a route declared `ssr: false` after
any ordinary client navigation. Its `?? "full"` fallback is documented as "the
route has no plugin entry", and only `start()` (and an `invalidate()`-triggered
refresh) wrote the marker it reads — so the fallback also spoke for routes that
have an entry:

```
await r.start("/admin")     → marker "client-only"   getSsrDataMode "client-only"
await r.navigate("home")
await r.navigate("admin")   → marker undefined       getSsrDataMode "full"
```

Same router, same route, two answers, and the second is the opposite of what the
route declares. The documented client-side branch — *"if `getSsrDataMode(state)
=== "client-only"`, fetch it yourself"* — never fired, so an app following the
docs silently rendered an empty view.

⚑ No new hook: the `subscribeLeave` listener already ran on every navigation and
returned early one line down. The marker write moved above that gate, which costs
a `Map.get`, a `claim.write`, and — for the function form only — the resolver
call the docs already described as per-navigation. A route with no entry still
writes nothing, so the `"full"` fallback keeps the meaning it documents.

Three claims in `packages/ssr-data-plugin/CLAUDE.md` are corrected with it: the
resolver is called per navigation rather than "once per `start()`", and the leave
listener is no longer a pure early-return when no staleness flag is set.
