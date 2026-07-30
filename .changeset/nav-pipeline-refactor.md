---
"@real-router/core": patch
---

Route `navigate()` through the nav pipeline (`src/pipeline/`, milestone 1) — no behaviour change (#1569)

The transformation "navigation intent → committed state + URL" was spread across
eight entry points, each re-composing the same operations in its own order. This
introduces the module that owns it: three primitives over one opaque type, and
switches the first entry point onto them.

```ts
canonicalize(port, name, params, search) // ① forwardTo + ③ route defaults → Canonical
buildURL(canonical, port)                // ⑤a — the URL of that intent
materialize(canonical, opts)             // ⑤b — the State of that intent
```

`Canonical` carries a `unique symbol` brand that is never exported, so
`materialize({ name, path, query })` does not compile. "Build a URL or a State out
of un-defaulted channels" becomes unrepresentable rather than a bug to remember —
`buildURL` prints the query from `canonical.query` alone, never from a
`search ?? params` fallback.

**Pure refactor: `navigate()` behaves as before on every ordinary input.** The
whole existing suite passes with no test edited (182 files / 3702 tests), which is
this step's acceptance criterion — any test that needed changing would mean
semantics moved, and that belongs to the follow-up steps, not here.

One measured exception, on an input class no test covers: stage ③ now runs inside
`canonicalize`, i.e. **before** the route-existence check, so on an **unknown**
route a `search` bag whose property access throws now surfaces that throw instead
of rejecting with `ROUTE_NOT_FOUND` (plain bags, and every bag on a route that
exists, are unaffected).

Two implementation details are deliberate and load-bearing, both measured rather
than assumed:

- The port's `resolveForward` is wired to the `forwardState` **seam**
  (interceptors + the channel-separation wrapper), so channel separation stays
  in the port implementation and never enters the pipeline module. The module is
  already in its target shape; the seam is what changes later.
- The port's `buildPath` is wired to the **interceptable** `ctx.buildPath`,
  because one `navigate()` runs both the `forwardState` and the `buildPath`
  interceptor today. Calling the engine's matcher directly would have silently
  stopped running `persistent-params`' `buildPath` interceptor on the navigate
  path.

Stage ③ now has two callers (`makeState` and `canonicalize`), so the merge helper
and the state-object constructor moved to shared helpers — one source of truth for
"route default under the caller's value" and one state shape, instead of two
copies free to drift.

Locked by five properties on `canonicalize` as a pure function
(`canonicalize.properties.ts`, mutation-validated): caller beats default on both
channels, `undefined` is absence on both sides, channels are never re-split,
channels are frozen at merge time while the caller's bag is not, and stage ③ is
idempotent.
