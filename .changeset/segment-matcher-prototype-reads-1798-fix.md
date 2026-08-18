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

Cost, measured same-session with alternating processes (A/A floor ~3%): unchanged
for static routes (the empty-slot fast path) and for the query direction; **+6.7%
on a three-slot `buildPath`** (~6.5 ns per slot), which is what the own-property
test costs on that loop.
