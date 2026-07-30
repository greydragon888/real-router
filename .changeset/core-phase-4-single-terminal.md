---
"@real-router/core": patch
---

`makeState` IS the pipeline's literal form — one terminal, not two (nav-pipeline Phase 4, #1548)

`StateNamespace.makeState` carried its own copy of stage ③ (merge each channel's
route default UNDER the caller's value) and of the mode gate — a second
canonicalisation living outside `src/pipeline`. It now calls
`canonicalize(…, { resolveForward: false })` + `materialize`, the same form
`buildPath` and `isActiveRoute`'s literal arm take, which is exactly this
method's documented contract: `forwardTo` is not resolved, but the NAMED route's
defaults are applied (forwardState invariants #7/#8).

Two terminals for one rule was never a style problem. #1584's existence
precondition — "do not name a route that does not exist" — landed on the
pipeline's terminal and not on this one, because it was found by sweeping
`canonicalize`'s PORT consumers and this method read its own dependency bag
instead. That is now structurally impossible: there is one implementation, and
its mutant reddens both arms of the gate's test file.

**No behaviour change**, verified rather than argued: a 71-cell before/after
snapshot (three `queryParamsMode` values × 23 shapes — both default slots,
overrides, `undefined` on either side, the `/coll/:id?id` collision, an
`Object.prototype` key, an undeclared key, a nonexistent route, explicit vs
derived path, singleton identity, frozen-ness) is byte-identical. The literal
form additionally applies `withholdFilledSlots`, and that is unreachable here
rather than new: the only door to this method is `PluginApi.makeState`, whose P1
channel guard refuses the bag that would trigger it on the _same_ predicate —
own key, defined value, `?`-declared.

Two pieces of dead surface fell out, both found by coverage rather than by
reading:

- **`makeState`'s `skipFreeze` parameter is gone.** It died when Phase 2 moved
  its last two callers (`canNavigateTo`, `isActiveRoute`) onto
  `materialize({ skipFreeze: true })`; the old body hid the death by forwarding
  `undefined` into a slot that needs no branch. The public `PluginApi.makeState`
  type never had it.
- **`StateNamespaceDependencies` drops seven of its eight members** — both
  default maps, `getQueryParams`, `hasRoute`, `admitsUndeclaredQuery`,
  `getDropReporter` and `buildPath` existed only to feed the duplicate. One
  arrives (the port); `getUrlParams` survives, for `areStatesEqual`.

A new test pins the merge's own-key guard through the QUERY channel: the path
channel is filtered by `normalizeParams` before the merge for every producer
now, so the query side is the only one that still reaches it — and it needs a
route that HAS a `defaultSearch`, since the merge short-circuits without one.
