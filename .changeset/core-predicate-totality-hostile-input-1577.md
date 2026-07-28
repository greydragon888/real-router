---
"@real-router/core": patch
---

Keep the render-path predicates total against hostile input (#1577)

`canNavigateTo` and `isActiveRoute` both document that they answer rather than
throw — a predicate running on every `<Link>` render must not raise into a
render. Both leaked an exception when user code ran while they answered:

- `canNavigateTo` called `forwardState` outside its `try`, so a dynamic
  `forwardTo` callback, a plugin's `forwardState` interceptor, or the caller's
  own bag (channel separation walks it with `Object.entries`, so an
  accessor-backed key throws there) escaped to the caller;
- `isActiveRoute` had wrapped only the destination arm (#1573). Its literal arm
  splits the caller's bags and its ancestor branch recombines them, so both
  still read a hostile `Proxy` / getter / reactive object unprotected.

Both now answer `false` and log a `logger.warn` — never silent, because user
code crashing is an operational fault rather than a route that legitimately
blocks (the split #959 already drew for a throwing guard), and never
propagated. `isActiveRoute` takes one boundary around the whole walk rather than
a `try` per read, the shape `isParams` took for the same class of input (#1052).

`buildPath` is deliberately unchanged: it is a builder with a documented
throwing contract, which is exactly why `canNavigateTo` wraps its call to it.
