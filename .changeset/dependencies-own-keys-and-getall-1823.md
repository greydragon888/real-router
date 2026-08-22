---
"@real-router/core": patch
---

fix(core): the dependencies channel adopted inherited keys, and `getAll()` handed out a prototype-swap primitive (#1823)

**Inherited keys became dependencies.** Neither copy loop filtered own keys, so
`setAll(Object.assign(Object.create({ leaked: "LEAK" }), { real: 1 }))` put
`leaked` in the store, through the constructor door and through `setAll` alike.
Both loops now walk `Object.keys` — the same walk, through the same kind of
module-level capture, that `guardDependencies` uses.

⚠ An intermediate draft gated a `for…in` with `Object.hasOwn` instead. Those
enumerate the same set for a plain object but NOT for a Proxy: `for…in` asks the
`ownKeys` trap plus the chain, `hasOwn` asks the `getOwnPropertyDescriptor` trap,
and a bag that answers those two differently got a key past the copy loop that the
guard had never judged — including #1799's own payload, a forbidden getter that
reached the store and ran. Walking `ownKeys` once leaves the two halves nothing to
disagree about. It is also faster: measured −18 % at one key and −25 % at twenty,
against an A/A floor of 1.6 %.

**`getAll()` is published API and returned a hazard.** The store is
`Object.create(null)`, so an own `"__proto__"` is an ordinary key there — but the
spread that built the result re-defined it on a normal object, and the result was
then a prototype-swap primitive for any consumer merging it with `Object.assign`
or a `for…in` copy. `cloneRouter` spreads and was safe; a consumer was not. The
result still comes from a spread — which DEFINES rather than assigns — and the
one key that cannot be trusted to it is deleted afterwards.

⚠ The first draft replaced the spread with a `all[key] = value` loop, and that
turned an already-immune site into a member of the class this fix is about: an
ordinary dependency name carried as an accessor on `Object.prototype` made
`getAll()` throw. Define-vs-assign is the axis; "copy it key by key" is not a
safe reflex.

⚠ Asymmetric with `get("__proto__")`, deliberately: the single read hands back a
value, this door hands back a CONTAINER someone will merge.

⚠ The `delete` is UNCONDITIONAL. Guarding it with `Object.hasOwn(source, …)`
decides nothing — deleting an absent key is a no-op in every observable respect —
while putting a re-pointable intrinsic read in front of the one line that
neutralises the hazard; with `hasOwn` shimmed to `false` the whole primitive came
back.

⚠ Which assertion discriminates depends on HOW the result is built, and the test
carries both because the implementation has already moved once. Against the
shipped spread + `delete`, dropping the delete leaves `"__proto__"` an ordinary
own key, so the returned object's prototype stays intact and the
`Object.assign(merged, all)` half is what reds. Against the write-loop draft the
polarity was the reverse: the write swapped the RESULT's own prototype, and a cell
checking only the merge target passed on the defect.
