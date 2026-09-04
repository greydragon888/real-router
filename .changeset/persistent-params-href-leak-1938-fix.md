---
"@real-router/persistent-params-plugin": minor
---

The stored value now rides one seam, so a route schema governs the href (#1938)

The plugin registered on **two** of core's interception points: `forwardState`,
which builds the state's query channel, and `buildPath`, the executor that prints
the URL. Since core #2087 `router.buildPath` runs the `forwardState` chain too,
which made the second registration redundant on every door — and left it sitting
BELOW the route-default merge, after any validating plugin had already answered.

Measured on a router with `search-schema-plugin` in the recommended order and a
tracked value the route's schema rejects:

```
before   router.buildPath("list", {}, { q: "x" })  →  /list?page=-99&q=x
         state.path                                →  /list?q=x
         state.search                              →  { q: "x" }

after    router.buildPath("list", {}, { q: "x" })  →  /list?q=x
```

An href no navigation produces, and the `#802` class — an injection channel below
the validation seam — with two first-party plugins. The `buildPath` registration
is gone, and with it the per-navigation `#pendingRemovals` bookkeeping that
existed only to carry a removal request from one seam to the other.

Every documented behaviour is unchanged, measured form by form: a caller's query
value still wins over the stored one, a declared query name spelled in the path
bag is still ignored on `buildPath` and still refused by `navigate`, and a
removal marker (`{ key: undefined }`) is still honoured in **either** channel —
now by the one seam, since `mergeParams` applies it in the query bag and the
tracked-key loop applies it in the path bag.

`minor` rather than `patch`: a third-party plugin whose own `buildPath`
interceptor drops the search argument no longer has this plugin re-injecting
underneath it.
