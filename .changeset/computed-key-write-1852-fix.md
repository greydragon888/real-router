---
"@real-router/core": minor
---

A write under a key core did not choose no longer consults the prototype chain (#1852)

`target[key] = value` is `[[Set]]`, which walks the destination's chain BEFORE
storing. So when the chain carries that name the write does not happen: a
getter-only accessor THROWS, a getter+setter pair diverts the value into
application code, and a non-writable data property drops it. `Object.prototype`
is that chain for every plain `{}`, and an ordinary library extension puts things
there — **no attacker required**.

The names that hurt are the ones a route declares. Measured on bare core with an
ambient accessor named `tab` on a `/p/:id?tab` route:

```
router.navigate("p", { id: "7" }, { tab: "reviews" })
  → TypeError: Cannot set property tab of #<Object> which has only a getter
```

⚠ **`__proto__` was never the whole hazard, and treating it as one is what kept
this open for three releases.** #855, #1191 and #1788 each special-cased that one
literal in one file; the reasoning given was that `Object.prototype`'s other
eleven own members are plain writable data properties, which is true and beside
the point. Every one of those three has been replaced.

**Fifteen sites in core, derived rather than counted.** The query parser, six in
the matcher (including two `Object.assign` calls — the same `[[Set]]` per key, in
a form a `dst[key] = …` census cannot see), both channel mechanisms, the plugin
context claim, `update()`'s custom-field patch, all three `RouterError` field
writes and the thrown-object metadata filter.
`tests/functional/computed-key-write-authority-1852.test.ts` walks `src` for both
shapes and requires every remaining write to carry a written reason —
mutationally validated: a new unguarded write, a removed reason, and a scanner
blinded to `Object.assign` each red it.

**`__proto__` is no longer a special case in the WRITE, and still not published
in a CHANNEL.** The three hand-written `defineProperty` special cases (#855,
#1191, #1788) are replaced by the one primitive, so a route's custom fields and a
plugin's context namespace carry the key as ordinary data through the same code
path as every other name.

⚠ The published channel bags are the deliberate exception. `state.params` /
`state.search` still drop `"__proto__"` at the copy sites, because a bag core
hands BACK carrying it is a prototype-swap primitive for any consumer merging it
with `Object.assign`:

```
?__proto__                    → state.search would hold { __proto__: null }
?__proto__=1&__proto__=2      → { __proto__: [1, 2] }
```

The inherited setter accepts both an object and `null`, so one
`Object.assign({}, state.search)` in consumer code would replace that object's
prototype with data from a URL. `getDependenciesApi.getAll()` deletes the same
key for the same reason and in those words, and records the asymmetry this
follows: a single read hands back a VALUE, a door like this hands back a
CONTAINER someone will merge.

⚠ Carrying it was shipped inside this change and reverted before release. The
motive — "a query string may legitimately say `?__proto__=1`, do not discard the
user's data" — does not survive contact with a consumer: `Object.assign` drops
the key even in the safe string case, so the preservation held for exactly one
hop and then failed unpredictably rather than at the router boundary.

**The cost, and a correction.** The canon priced the fix at "`Object.defineProperty`
at 6-9× plain assignment" and named a prototype-less `params` as the alternative.
That alternative is the EXPENSIVE horn: V8 keeps such an object in dictionary
mode, so the price lands on every later READ. Measured end-to-end, same-session
A/B, medians, A/A floor in brackets:

| arc                        | prototype-less alternative | the shipped guard   |
| -------------------------- | -------------------------- | ------------------- |
| `buildPath`, splat param   | —                          | **+12.0 %** (0.7 %) |
| `isActiveRoute`, exact     | —                          | **+6.8 %** (0.1 %)  |
| `matchPath`, path params   | —                          | **+4.5 %** (0.8 %)  |
| `buildPath`, static        | —                          | +1.7 % (1.7 %)      |
| `buildPath`, one path slot | **+65.4 %**                | −3.1 % (1.0 %)      |
| `isActiveRoute`, sibling   | —                          | −0.3 % (0.3 %)      |

⚠ **The guard COSTS, and an earlier revision of this file said it was "not
measurable".** That reading came from medians-of-five whose A/A floors were
5-6 %; on a quiet machine the harness floors at 0.1-1.7 %, and at that resolution
the cost is plain. Worse, the arcs it sampled — one path slot, the sibling arm —
are exactly the two that do NOT move. The price is accepted deliberately: it is
what the guarantee costs, and three cheaper formulations (a monomorphic `in`
receiver, a prototype-less accumulator published through `publishRecord`, an
optimistic store repaired afterwards) were built and measured before accepting
it. The figures and the rejections are in `putField`'s docblock.

⚠ **CodSpeed reports −13.83 %, which is not the shipped cost.** The suite runs
`tsx` against `src`, so its profile carries ESM module-namespace getter frames
the bundle does not have (`grep -c 'get: ()' dist/esm/index.mjs` → 0), and
`Simulation` over-counts instructions a superscalar CPU hides. On the
worst-reported arc the sign inverts: −17.25 % simulated, −3.1 % (faster) in the
bundle. ⚠ An earlier revision of this
file published `+0.7 / +2.6 / +4.0 / +0.3` here. Those were real measurements of
a different thing: taken against a tree whose `__proto__` skips had been removed,
and with the primitive's earlier one-term predicate. Re-measured against `HEAD`
with the shipped code, same-session, alternating processes, medians of five.

`putField` asks `key in target && !hasOwn(target, key)` once and pays
`Object.defineProperty` only where the chain answers and the target does not
already own the key — in a pristine environment, never. ⚠ The second term is
load-bearing: without it the primitive REDEFINES an existing own key with a
fixed descriptor, which threw on a sealed target, silently cleared
`writable: false`, and turned `RouterError`'s non-enumerable `stack` accessor
into enumerable data — changing `Object.keys(err)` and making two errors that
differ only in stack compare unequal.
⚑ It asks the TARGET's chain, not `Object.prototype`. The cheaper form is right
only while every destination is a fresh `{}`; measured, one inheriting the
accessor from anywhere else walks straight past it.

**A stated limit: the NUMERIC-keyed half is not closed.** `Array.prototype.push`
writes at `length`, an index the array never owns, so it always consults the
chain — ~100 calls across the packages, two of them reachable from a public
door (`createRouter` throws under a getter on `Object.prototype["0"]`; a
repeated query key makes `matchPath` either stop matching or substitute the raw
URL chunk). Out of scope because the precondition differs in kind: a numeric
accessor on `Object.prototype` is nobody's accident, while every site closed
here is exposed by an ordinary library extension naming `id` / `tab` / `lang`.

**New subpath `@real-router/core/utils`** exports `putField` and `copyFields`.
The rule is the plugin author's too — a plugin copying a caller's `params` into a
record of its own writes under a key it did not choose, and four shipped plugins
were doing exactly that. A copy per package is how this class acquired its three
partial fixes.

Part of #1901.
