---
"@real-router/core": patch
---

fix(core): snapshot `queryParams` so an accessor-backed one cannot break `dispose()`

`deriveMatcherOptions` passed the caller's `queryParams` object into
`RoutesStore.matcherOptions` **by reference**, and `createMatcher` re-reads it on
every matcher rebuild — `add` / `remove` / `replace` / `setRootPath`, and
`resetStore`, which `dispose()` goes through.

`queryParams` is supported input and may be accessor- or Proxy-backed, so those
rebuilds were running application code. A getter that answered differently on a
later read threw out of `dispose()` **after** `sendDispose()`: `isDisposed()` was
already `true`, so the idempotency early-return swallowed every retry, and
`markDisposed` / `clearAll` / the dependency reset never ran. The router still
answered `navigate` and `subscribe` while claiming to be disposed, and held every
DI reference it was supposed to release — per request, in an SSR scope.

Core documents that teardown as holding together "only because no user code runs
in them" (INVARIANTS, Route Management #17/#18), and this was the read that made
that false.

The four format fields are now read once by the snapshot, at construction, where
application code is expected; every later read sees plain data — measured: zero
reads of the caller's getter across a later matcher rebuild. That also collapses
a TOCTOU inside `makeOptions`, which tests a field and then re-reads it for the
value. ⚠ Not "each field twice": the fast path is a `&&` chain, so it stops at
the first defined field — for the bag a router actually passes, only
`arrayFormat` is read twice and the other three once.

⚠ Once by the SNAPSHOT, not once in the process — `OptionsNamespace`'s deep-freeze
walks the same object first, so an accessor that answers differently per call is
still invoked more than once during construction. That is not the defect above
and is not fixed by reordering: construction is where a router is allowed to run
the caller's code. The guarantee this buys is that the count AFTER construction
is zero.

⚠ Read by NAME rather than `{ ...queryParams }`, and that is measured rather than
stylistic. A spread copies own ENUMERABLE keys only, so it silently dropped a
format inherited through the prototype (`Object.create({ arrayFormat:
"brackets" })` — layering one config over another) or defined as own
non-enumerable: both worked before, because a plain `opts.arrayFormat` walks the
chain, and both fell back to the format's default with nothing said while
`getOptions()` kept echoing the value the caller set. The by-name read keeps that
lookup and still yields plain own data. The hand enumeration it costs is bound to
`search-params`' `Options` by `type-mirror-authority.test.ts`, so a fifth format
field cannot be added without reaching here.

`deriveMatcherOptions` also stops asserting `options.queryParams!`. That assertion
was false — `createRouter(routes, { queryParams: undefined })` reaches it with
nothing, which a spread quietly turned into `{}` and a by-name read turns into a
`TypeError` thrown from inside the constructor. A nullish or non-object container
is tolerated, as it was before, mirroring `makeOptions`' own `!opts` guard;
rejecting one by name stays with `@real-router/validation-plugin`.
