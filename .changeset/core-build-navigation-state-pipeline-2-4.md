---
"@real-router/core": patch
---

Compose `buildNavigationState` through the nav pipeline (nav-pipeline Phase 2, step 2-4)

The last of the four state-producing entry points moves onto the shared
composition: `canonicalize` → existence check → `buildURL` → `materialize`, from
the same `RouteResolver` port `navigate`, `matchPath`, `buildPath` and
`canNavigateTo` now use. Behaviour is unchanged, verified byte-for-byte across 14
fixtures covering both channels, route defaults in either slot, `forwardTo`
(including a chain default and a chain resolving to a target that does not
exist), the `/coll/:id?id` collision, an unknown route, a missing required param,
and an undeclared key in `loose`.

The order inside the entry point is load-bearing and preserved: existence is
checked BEFORE the URL is built, because `buildURL` prints through the matcher,
which throws on an unknown route, whereas this entry point answers `undefined`
for one. P1 (`throwOnMisChanneledKey`) still runs first, on the caller's raw
argument.

`RouterInternals` gains a lazy `port()` accessor — a closure rather than a value,
because the port is created during wiring while `registerInternals` runs before
it, the same shape the interceptable methods already use.

Also re-anchored: the comment in `shared/browser-env/plugin-utils.ts` explaining
why an explicit query value outranks a `forwardTo` hop's default. It credited the
spread order inside `separateChannels` — stage ②, which Phase 4 removes. The
guarantee actually comes from #1570's rule (a default is never applied to a slot
the caller already filled, in either bag), which is a property of the merge and
survives the seam's removal. The two agree today, which is exactly why the wrong
one was easy to write down.
