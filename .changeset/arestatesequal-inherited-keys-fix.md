---
"@real-router/core": minor
---

`areStatesEqual` decides on the own-enumerable surface of a params bag, on both arms ([#1815](https://github.com/greydragon888/real-router/issues/1815))

Two states whose own `params` are **disjoint** could compare **equal**. The comparison counted a bag's own keys and then tested membership with `key in right`, which walks the prototype chain — so a bag carrying an inherited twin of every key on the other side passed the count check and every membership check.

```ts
const a = api.makeState("u", { ghost: "yes" });
const b = {
  ...api.makeState("u", { other: "1" }),
  params: Object.assign(Object.create({ ghost: "yes" }), { other: "1" }),
};

router.areStatesEqual(a, b, false); // was true, now false
```

⚠ **Behaviour change.** A parameter the bag does not list among its own enumerable keys now takes no part in the answer — inherited, non-enumerable, or vouched for only by a `Proxy`'s `getOwnPropertyDescriptor` trap. That is the supported-input rule (own enumerable properties only) applied to a comparison. If you hand the router a hand-built `State` whose parameters are layered onto a prototype — `Object.create(defaults)` — those parameters stop counting. Give the bag own keys (`{ ...defaults, ...params }`).

Only a caller-built `State` reaches this: everything the router produces already carries plain own keys, so `isActiveRoute` and the committed state are unaffected.

Three further things the fix settles, each measured:

- **The default arity had the same defect, by a different mechanism.** With `ignoreQueryParams` left at its default the comparison read each declared slot straight off both bags, so a state that only _inherited_ the slot compared equal to one that owned it. A bare index read is invisible to the `chain-walk-authority` census, which sees `in` and `for…in`; the census now declares that blind spot. Both arities now answer under one rule — the whole-bag comparison, and the same comparison restricted to a route's declared slots.
- **Equality was not symmetric.** The whole-bag loop runs over the LEFT bag's own keys, so which side carried the prototype decided the answer — `areStatesEqual(a, b, false)` was `true` while `areStatesEqual(b, a, false)` was `false`. INVARIANTS `areStatesEqual` #2 states symmetry and did not hold.
- **Neither `Object.hasOwn` nor `propertyIsEnumerable` is the right test, and neither is what shipped.** Both let the CALLER choose the key and put it to `[[GetOwnProperty]]` — on a `Proxy`, the `getOwnPropertyDescriptor` trap, which may vouch for a key `ownKeys` never listed. `Object.keys` asks `ownKeys` first, so membership is decided by the list it returned: the whole-bag arm reuses the array it already built for the count, and the declared-slot arm builds one per bag above the loop. Same argument as #1854, and the same bag — Svelte 5's `$props()` reports own-ness for a key only its prototype has (#1853). Each weaker spelling was measured against all three carrier shapes and each left one reproducing: `Object.hasOwn` on the non-enumerable twin, `propertyIsEnumerable` on the descriptor trap. This issue's own reproduction — an inherited twin — is closed by both, which is why the third shape had to be found rather than assumed.

**Cost, and it lands on the render path.** `isActiveRoute` asks the DEFAULT arity on every call, so a `<Link>` render pays the declared-slot comparison. That arm no longer reads `params[slot]` directly — it consults the own-key list, which is two `Object.keys` calls per comparison: measured at one declared slot on one-key bags, **5.3 ns → 16.8 ns**. End to end that is **+11.7 % on `state/isActiveRoute-exact`** (CodSpeed), reproduced natively on alternating processes at 109 ns → 125 ns.

The whole-bag arity is cheaper to reach: the name check short-circuits first, so comparing two different routes is unchanged (10–16 ns either way, inside the noise), and a matching-name comparison goes ~22 ns → ~44 ns.

⚠ There is no cheaper correct spelling. `Object.keys` is the only primitive that asks `ownKeys` FIRST, and building the lists lazily was measured and saves nothing (16.2 ns vs 16.8 ns) because both lists are needed anyway. The price buys the fix: a bare index read is what let a state that merely inherited a slot compare equal to one that owned it.

⚠ **A complexity change comes with it, bounded rather than removed.** Membership is a linear scan, so the whole-bag comparison is O(n²) in bag width where the `in` form was O(n). Measured against `in`: 0.9–1.1× up to n = 20, 2.8× at n = 200, 9.6× at n = 1000. A `Set` is the O(n) alternative and was rejected on measurement — it costs a flat 1.4–1.5× at every width and 2.5× at n = 1, which is the width these bags actually have. `state.params` is bounded by the route's declared slots; `state.search` is bounded by the URL, so a query string a browser will carry lands near n = 200.
