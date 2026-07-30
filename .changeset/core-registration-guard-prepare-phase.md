---
"@real-router/core": patch
---

Three fixes the Phase 2 code review found (#1548)

**`replace()` no longer erases definition guards on a refused batch.** The
config-time channel check (`assertRouteDefaultChannels`, shipped with "the slot
IS the channel") ran inside `adoptRouteArtifacts`, one line before the swap.
That is early enough for `add` and too late for `replace`, which calls
`clearDefinitionGuards()` first: a batch the check refused left the tree intact
and the old definition guards GONE, so a route whose `canActivate` was blocking
became freely activatable — with nothing in the error saying access control had
just been dropped. Measured: `canNavigateTo("guarded")` `false` → **`true`**
after a rejected `replace`. The check moved into both callers' PREPARE phases,
beside the #1046 handler-limit and #1193 guard-compile hoists that closed the
same fail-open twice before; `adoptRouteArtifacts` is now genuinely throw-free,
which is what its "atomic swap" contract already claimed.

**The mode gate's diagnostic is silent about a nonexistent route at BOTH
terminals (#1584).** The existence precondition landed only in
`pipeline/canonicalize`, because it was found by sweeping that file's PORT
consumers — a sweep that cannot see `StateNamespace.makeState`, which reads its
own dependency bag. `makeState` with an explicit `path` is exactly how a URL
plugin rebuilds a state from a serialized history entry, so it does not fail on
its own the way the navigate arm does; it reported `Query key "q" is not declared
on route "nope"` about a name that is not a route. The de-dup cache is shared by
both terminals, so each bogus report also burnt the slot that would have carried
the genuine warning once that name became real.

**A `defaultSearch` whose key is an `Object.prototype` name is applied again.**
The withholding rule ("a default is not applied to a slot the caller already
filled") read the caller's bag with a bare `params[key]`, which walks the
prototype — so on an EMPTY bag `toString` / `constructor` / `valueOf` read as
filled. The rule runs only in the literal form, so `buildPath` and
`isActiveRoute` withheld while `navigate` / `makeState` applied: one producer out
of agreement, printing an href its own route does not reproduce — the #1552/#1578
shape the rule exists to close. Guarded with `Object.hasOwn`, as the sibling
`findMisChanneledKey` already was.

Also: `port.reportDroppedQueryKey` is a getter, like its sibling
`reportUndeclaredParamKey` — a plain closure is always truthy, so the pipeline's
optional-chain never gated anything and bare core paid #1584's `pathNames`
existence lookup once per dropped key with no sink behind it. Both sinks now
report their absence honestly, and the two comments that asserted this gate are
true rather than aspirational.
