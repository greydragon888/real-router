---
"@real-router/core": minor
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
  `state.path`, which `matchPath(state.path)` then resurrected as a real query
  value on every popstate;

  ⚠ NOT in the direction the mode gate (#1575) forbids, and an earlier draft
  cited it as though it were. The gate's invariant is
  `keys(state.search) ⊆ keys(matchPath(state.path).search)`; measured on the
  defect, `state.search` is `{}` against `{toString: …}`, so the containment
  HOLDS — `{} ⊆ {toString}` — and the gate is not violated. What breaks is the
  REVERSE containment: the state under-reports what its own URL prints, which no
  invariant currently names. The defect is real either way; the citation was not;

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
the write primitive fixed in #1792 (shipped in core 0.94.0) — pinned as an explicit boundary
cell rather than left as a silent gap.

⚠ **BREAKING for `encodeParams`, and this is the reason for the `minor`.** The
own-property rule applies to whatever a route's codec RETURNS, and
`RoutesNamespace` forwards that value to the matcher verbatim — it is the one bag
that reaches this read without passing through `normalizeParams`. So a codec
whose returned object carries its values on a PROTOTYPE now fails the
required-param check:

```
encodeParams: ({ params }) => ({ params: new ParamsVM(params), search: {} })
                                          // `get id()` on the class prototype

  before  buildPath("a", { id: "7" })  →  "/a/7"
  after                                →  Error: Missing required param 'id'

CONTROL  a codec returning a plain object  →  "/a/7" on both
```

That is wider than prototype pollution: a ViewModel is ordinary code, not an
attack, and returning one was legal. It stays refused, deliberately — the rule
this change buys is "the router reads only what the bag OWNS", and a rule with a
carve-out for "unless the prototype looks benign" is not checkable at the read.
The migration is one line: return an own-keyed object (`{ ...vm }`,
`Object.fromEntries`, or a plain literal). A codec returning a plain object,
which is what every example and every first-party plugin does, is untouched.

⚠ Not symmetric with the CALLER's bag: a caller may still hand `navigate` /
`buildPath` an object with inherited values, because `normalizeParams` copies own
keys off it before the matcher sees it. Only the codec seam is affected, and only
because nothing copies there.

Cost, measured on a quiet machine, 5 alternating rounds per variant, medians
(probe: `benchmarks/audit-probes/segment-matcher-own-property-reads-2026-08-18/`):
the own-property test costs a few ns per PATH SLOT — `+8.1%` at three slots and
`+9.5%` at five. Static routes are unaffected (the `slots.length === 0` fast path
returns before the loop) and so is the query direction (`Object.hasOwn` ≈ `in`),
both flat within the A/A floor.

⚠ Three qualifications, from a re-measurement that did NOT reproduce the first
reading, and they bound what this section may be read as claiming:

- **The one-slot cell is withdrawn.** Its `+7.4%` sits BELOW that shape's own
  stated A/A floor of `8.1%`, so it is not distinguishable from noise and must
  not be quoted as a measurement. The `~7.9 ns per slot` figure was derived from
  it and is withdrawn with it.
- **Per-slot COST is not constant.** Order-balanced (A-first and B-first arms
  averaged), it DECLINES with slot count — 8.4 / 8.1 / 6.3 ns at one, three and
  five — in both arms independently. The earlier "constant, therefore
  attributable" argument does not survive its own re-run.
- **The protocol has an uncontrolled order effect.** Alternating `A B A B …`
  puts A first every round; forward vs reversed moved each cell by 2.2–3.9 pp,
  which is the size of the margin the smaller claims had over their floors. The
  A/A floor spread by shape is `2.6–8.1%`, not `3.7–8.1%` — the lowest cell was
  dropped when the numbers were copied from the probe header.

What survives re-measurement is the DIRECTION and the order of magnitude: a
small positive per-slot cost, a flat static control, a flat query direction.
