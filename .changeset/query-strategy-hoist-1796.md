---
"@real-router/core": minor
---

fix(core): resolve the query strategies once, at matcher construction (#1796)

`resolveStrategies` ran per parse and per build, so an invalid `queryParams`
format surfaced from inside `matchPath` — and its call sites are the ones with
nobody to catch for them: `navigation-plugin`'s `navigate`-event handler (an
un-intercepted event makes Chromium fall back to a full-document navigation) and
`preload-plugin`'s hover path, where the listener is registered directly on
`document`. `createMatcher` now resolves once, so `createRouter` refuses an
invalid format and `match()` cannot raise a config error at all.

That also makes the refusal unconditional. Both directions short-circuit on an
empty query before resolving, so a router with a bogus format used to run
cleanly until the first URL that happened to carry a query key.

⚠ **Behaviour change.** A router configured with an invalid `queryParams` format
previously constructed fine and then resolved MOST query URLs to `UNKNOWN_ROUTE`
with no diagnostic; `createRouter` now throws the named `TypeError`. Only a
misconfigured router is affected — a valid format is untouched, and a malformed
percent sequence still unmatches instead of throwing.

⚠ Most, not every, and the exception is why this matters. Measured on the
pre-#1796 base, four formats × two values: with an ordinary typo (`"bogusTypo"`)
all four unmatch, but with a PROTOTYPE name (`"toString"`) `arrayFormat` and
`nullFormat` **parsed correctly** — `{"a":[1,2]}` and `{"a":null}`,
byte-identical to a valid config, because the native method the lookup resolved
to happened to satisfy the call. So the prior behaviour was not "everything
404s": two of the four formats worked, silently, on a configuration the router
should have refused.

**The three shared defaults are frozen.** `makeOptions` hands back a
module-level cached singleton BY REFERENCE — a pinned perf invariant — so an
unfrozen one is a process-global, the #897 class (`LEVEL_CONFIGS` exported
unfrozen corrupted the global log threshold); measured before the fix, a single
write to it changed what every later `makeOptions()` returned.

⚠ The reach is narrower than "every default-configured router", which an earlier
draft claimed: `OptionsNamespace` fills `queryParams` with
`DEFAULT_QUERY_PARAMS`, whose four fields are all DEFINED, so the all-undefined
fast path does not fire and such a router gets a FRESH object.
`DEFAULT_QUERY_PARAMS` itself is shared by every one of them by reference
(measured), and the resolved singleton is reached by a caller passing nothing or
an empty bag. Nothing in the engine mutates any of the three, so the freeze costs
nothing and makes read-only structural rather than conventional.

It also removes an ORDER DEPENDENCE that predates this change: `OptionsNamespace`
deep-freezes the router's options and its defaults reference
`DEFAULT_QUERY_PARAMS`, so the FIRST `createRouter` froze the module singleton as
a side effect — `Object.isFrozen` answered `false` in a process that had not
built a router and `true` in one that had.

⚠ **Three input classes stay outside the guard**, because they never reach
`resolveStrategies`: a nullish format value (coerced to the default by `??`), a
format on a route rather than the router, and a `queryParams` CONTAINER that is
not an object at all, accepted in silence — a truthy non-object (a string, a
number) reads `undefined` through the same four field probes, while `null` / `0`
/ `""` do not reach them at all (`makeOptions` opens with `!opts`). All three are
silent in bare core and are `@real-router/validation-plugin`'s to report.

**Measured cost**, alternating processes, min-of-5 timing reps, five rounds,
against the pre-#1796 base: `matchPath` **−3.3 %** and a query-emitting
`buildPath` **−3.0 %**. #1798's own reads cost `+7.2 %` / `+7.0 %` on the same
shapes, so the pair is a net improvement over doing neither — the hoist buys back
more than the read change costs.
