---
"@real-router/core": patch
---

A clone inherits the limit KEY SET its base was built with (#1961)

`cloneRouter` read `Object.keys(options.limits)` live, at clone time. That bag is
the caller's own object, and `deepFreeze` recurses only when
`value.constructor === Object` — so an `Object.create(null)` bag and a class
instance are never frozen. Deleting a key after construction left the base
capped and every LATER clone with NO CAP AT ALL — measured against a base that
throws at 2. Under SSR that is a per-request clone enforcing a different listener
cap from its base — #1880's own shape, reopened through the key set rather than
the values.

The names the caller passed are now snapshotted at construction, beside the
values `createLimits` already resolved, and frozen for the reason those values
are: `getCloneState` hands both out by reference. The clone reads the snapshot.

Nothing moves for a bag nobody mutates: measured across eleven shapes — absent,
`null`, empty, partial, string-valued, full, non-enumerable, null-prototype,
class instance, unknown-key and own-`__proto__` — every reported value and every
enforced cap is byte-identical on base and clone. What DOES move is the mutated
case, which is the fix: the late clone now reports and enforces what the base
enforces. The BASE's own report still follows the caller's object, so after such
a mutation it reads `{}` while capping at 3 — see below.

⚠ Reachable on BARE core only, and that is measured rather than reasoned: every
shape `validation-plugin` admits is one `deepFreeze` reaches, across six probes
including a `Proxy` over a literal and an `Object` subclass. Two independent
copies of one `constructor === Object` predicate agreeing, as #1961 says — a
coincidence, not a guarantee, and moving either opens the other.

⚠ The issue's own reproduction does NOT reproduce — it uses a plain literal,
which IS frozen, so the `delete` throws. The defect needs a shape the
`constructor` test misses, and that is the whole population.

⚠ `Object.keys`, mirroring `createLimits`' spread, and NOT `Object.hasOwn` over
the five known names — which is what the issue recommends. The spread skips a
non-enumerable own key, so the base does not see one; a snapshot that did would
make the clone stricter than its base, and reds the pin that already covers it.

**`getOptions().limits` is unchanged, deliberately.** It still hands back the
caller's own object, so a write to a bag core could not freeze still moves the
report while the router keeps its resolved cap. That is the documented one-level
copy model (#1958) and not specific to this slot — measured, `defaultParams` and
`defaultSearch` alias identically. Changing it here would also blind
`validation-plugin`, which validates that slot and refuses six of the eight
shapes measured; substituting core's cleaned record would let all six through in
silence.
