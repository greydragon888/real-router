---
"@real-router/core": patch
---

Compose `matchPath` through the navigation pipeline (nav-pipeline Phase 2, step 2-2)

`matchPath` built its state by hand: call the `forwardState` seam, split the
route's own defaults by channel, merge them under the user's, apply the mode
gate, then rebuild the URL. Every one of those steps already exists inside
`canonicalize`, which `navigate` has used since milestone 1 — so the two
producers were maintaining the same composition twice.

The entry point now reads `canonicalize` → rebuild → `materialize`, from the same
`RouteResolver` port `navigate` uses. Behaviour is unchanged, verified byte-for-byte
across 35 fixtures covering both channels, route defaults in either slot, the
`/coll/:id?id` collision, `forwardTo`, decoders and encoders (including an
encoder that throws, #1157), all three `queryParamsMode` values, every
`trailingSlash` mode, `rewritePathOnMatch: false`, a `forwardState` interceptor
injection, `setRootPath`, and the unmatched path.

Two supporting changes ride along:

- `materialize` is now generic (`materialize<P, S>`), so the public chain
  `matchPath<P>` → `materialize<P>` → `State<P>` keeps the caller's param type.
  Without it the chain collapsed to `State<Params>` and a consumer's typed
  assignment failed to compile. Pinned by a type-level test.
- The port is created once in `wireNamespaces` rather than inside
  `wireNavigation`, because `navigate` is no longer its only consumer.

Note for anyone reading the RFC alongside this: stage ② (channel separation) does
**not** leave `matchPath`'s path here, and could not — `separateChannels` lives in
the `forwardState` seam, which the port itself calls. Measured: a `forwardState`
interceptor injecting a declared query key into `result.params` lands in
`state.search` both before and after this change, identically to `navigate`. The
channel guard's P2 position therefore stays dormant until the seam's wrapper is
removed.
