---
"@real-router/sources": minor
---

Add optional generic parameter to `RouteSnapshot<P>` / `RouteNodeSnapshot<P>` (#464)

Both snapshot types now accept an optional generic for typed `route.params`, defaulting to `Params` for full backward compatibility. Enables adapter-level propagation in `injectRoute<P>()` and similar hooks without a framework-specific snapshot shape.
