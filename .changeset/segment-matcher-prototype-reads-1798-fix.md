---
"@real-router/core": patch
---

Fix the URL build direction reading a declared param name off the prototype chain (#1798)

`SegmentMatcher` asked "did the caller fill this slot?" with two reads that walk
the prototype chain, keyed by a name the ROUTE declares — `name in params` for a
`?name` declaration and a bare `params?.[slot.paramName]` for a `:name` slot. For
a name that is a member of `Object.prototype` an EMPTY bag answered "yes" and
handed back the native method, with two separate consequences:

- a `?toString` route printed the serialized function into the href
  (`/a?toString=function%20toString()%20%7B%20%5Bnative%20code%5D%20%7D`) while
  the committed `state.search` stayed empty — a state contradicting its own
  `state.path`, which the always-on mode gate (#1575) exists to make impossible,
  and which `matchPath(state.path)` then resurrected as a real query value on
  every popstate;
- a `:toString` slot bypassed the required-param guard, so `navigate("a", {})`
  resolved instead of rejecting, because the `undefined`/`null` test never saw
  `undefined` — it saw the method.

Both reads now use `Object.hasOwn`, the spelling the `loose` arm eleven lines
below already used and the one `src/channels/` states by name. Measured radius:
the query direction leaked on **11 of the 12** own members of `Object.prototype`
and the path slot bypassed on **all 12** — four of them (`__defineGetter__`,
`__defineSetter__`, `__lookupGetter__`, `__lookupSetter__`) were not in the
issue's list of seven.

A bag that genuinely CARRIES such a key is unaffected: `?toString` still prints,
commits and round-trips when the caller supplies it, and a filled `:toString`
slot still builds. The one exception is `__proto__`, which is dropped upstream by
the write primitive tracked separately in #1792 — pinned as an explicit boundary
cell rather than left as a silent gap.

Cost, measured on a quiet machine, 5 alternating rounds per variant, medians
(probe: `benchmarks/audit-probes/segment-matcher-own-property-reads-2026-08-18/`):
the own-property test costs a constant **~7.9 ns per PATH SLOT** — `+7.4%` at one
slot, `+8.1%` at three, `+9.5%` at five. Static routes are unaffected (the
`slots.length === 0` fast path returns before the loop) and so is the query
direction (`Object.hasOwn` ≈ `in`), both flat within the A/A floor.

The per-slot linearity is the result, not any single percentage: each individual
delta sits within ~2x of its own noise floor (3.7–8.1% by shape), while a cost
that scales exactly with slot count — against a flat static control — attributes
it to the changed read and nothing else.
