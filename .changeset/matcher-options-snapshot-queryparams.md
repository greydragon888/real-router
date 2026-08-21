---
"@real-router/core": minor
---

fix(core): snapshot `queryParams` once, at construction (#1796)

`deriveMatcherOptions` passed the caller's `queryParams` object into
`RoutesStore.matcherOptions` **by reference**. `queryParams` is supported input
and may be accessor- or Proxy-backed, so every read of it is a call into
application code — and the released version reads it on **every query parse and
every query build**, forever. Measured on a single-getter bag: `createRouter` 1
read, then `+2` per `buildPath`, `+4` per `matchPath`, `+4` per `start()`.

The four format fields are now read once by the snapshot, at construction, where
running the caller's code is expected. Every later read sees plain data:
`createRouter` 2, and `0` for every parse, build, matcher rebuild and teardown
thereafter — pinned as a table in `read-count-authority.test.ts`.

Two consequences worth naming, because they are the actual user-visible win:

- A getter that answers DIFFERENTLY on a later read can no longer change a live
  router's behaviour mid-flight. Before, a drifting bag poisoned the long-lived
  base router; now a drift is caught at construction, so an SSR clone's bad
  config stays confined to that request.
- The stored copy is frozen, container and all, and the module-level empty
  singleton is frozen too. All three are reachable from the published
  `@real-router/core/validation` subpath, so this is a contract rather than
  internal hygiene: a write that used to take effect on the next matcher rebuild
  now fails at the write site.

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

⚠ Once by the SNAPSHOT, not once in the process — `OptionsNamespace`'s deep-freeze
walks the same object first, so an accessor that answers differently per call is
still invoked twice during construction. That is not a defect and is not fixed by
reordering: construction is where a router is allowed to run the caller's code.
The guarantee this buys is that the count AFTER construction is zero.

⚠ A coercion that THROWS is now reported as a config fault about its own field
(`Could not read arrayFormat — its \`toString\` threw`, with the application's
error as `cause`) rather than letting an unexplained application exception out of
`createRouter` naming no option at all.

`deriveMatcherOptions` also stops asserting `options.queryParams!`. That assertion
was false — `createRouter(routes, { queryParams: undefined })` reaches it with
nothing, which a spread quietly turned into `{}` and a by-name read turns into a
`TypeError` thrown from inside the constructor. A nullish or non-object container
is tolerated, as it was before, mirroring `makeOptions`' own `!opts` guard;
rejecting one by name stays with `@real-router/validation-plugin`.

⚠ **What this changeset deliberately does NOT claim.** Two earlier drafts of it
said that on the released version `createMatcher` re-read the bag on every matcher
rebuild and that a drifting getter made `dispose()` **throw**, leaving the router
undisposed and holding every DI reference per SSR request. Both were measured
false of the released version: rebuilds read it `0` times there and `dispose()` is
clean. Those defects were introduced by this change's own first commit and fixed
by its later ones — real, but never shipped, so describing them as fixes to a
released package would have told consumers about a bug they never had.
