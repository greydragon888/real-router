---
"@real-router/validation-plugin": patch
---

A refused `setDependencies` leaves the store untouched (#2253)

The dependency limit was checked from inside core's ingest loop, once per NEW
key, against the store as it stood. So the key that tripped it arrived after its
predecessors were already written: `setAll({a,b,c,d,e})` under
`maxDependencies: 3` threw a `RangeError` and left `a`, `b` and `c` behind, in
the iteration order of the caller's own object. A caller who catches that error
reads it as "nothing happened" and is wrong — and a retried, corrected batch then
meets `warnOverwrite` for the three that silently landed.

The batch is now judged before the ingest pass, from the pre-flight position core
already calls on the whole bag, so the refusal is atomic.

Only keys the store does not already hold count, matching the loop's own rule: a
batch of pure overwrites stays legal at the limit. `maxDependencies: 0` still
means no limit, and the single-key `setDependency` keeps its own refusal, which
has no batch to be atomic about.

⚠ The limit remains opt-in and plugin-side — bare core enforces none of the five
declared limits, which `packages/validation-plugin/CLAUDE.md` records. Core is
unchanged by this fix.
