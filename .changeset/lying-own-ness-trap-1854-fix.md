---
"@real-router/core": patch
---

A bag that lies about own-ness cannot put a key into a committed state (#1854)

`Object.hasOwn` was the gate on the channel entry, and it is not one. It is
`[[GetOwnProperty]]`, which on a `Proxy` is the `getOwnPropertyDescriptor`
**trap** — and the caller of `hasOwn` chooses the key, so the trap is asked
about one it is free to lie about. The Proxy invariants permit exactly that
while the target is extensible and the descriptor is `configurable`.

Measured before the change, route `/a/:id?tab`, a bag whose trap answers for an
inherited `leaked`:

```
state.params  { id: "2", leaked: "L" }
state.path    /a/2                      ← the committed state contradicts its own URL
buildPath     /a/1?tab=x&leaked=L
```

That is the invariant class this repo has consistently labelled a bug (#1553 /
#1554 / #1812).

**Not a hypothetical shape.** Svelte 5's `$props()` reports own-ness for a key
only its prototype has, on every `RouteView` render (#1853) — nobody writes a
Proxy, the framework does.

`Object.keys` replaces it at both doors: it asks `ownKeys` FIRST and consults
descriptors only for keys `ownKeys` already vouched for, so a key the target
does not own is never put to the trap. One read per key either way.

**Two doors, and the second was found by probing it rather than by reasoning
from the first:**

- `normalizeChannel` — the entry guard for both channels (#1812), so `navigate`
  and `buildPath` in one place.
- a route's own `defaultParams` / `defaultSearch` in the default merge. That bag
  is application data the app still holds and does **not** arrive through the
  entry guard, so it was live on its own: a lying default put `leaked` into
  `state.params` while `state.path` printed `/a/D`.

**This ports a decision the repo had already taken.** The dependency doors
learned the same lesson in #1799 / #1816 / #1823 and say so in
`dependenciesStore`: _"`for…in` asks `ownKeys` plus the chain, `hasOwn` asks the
`getOwnPropertyDescriptor` trap, and a bag that answers those two differently
gets a key past the copy loop that the guard never judged."_ The channel doors
are where that had not reached.

`Object.keys` is captured at module load beside `freeze` and `hasOwn`, for the
reason that header already gives: since this is now the own-ness gate, an
application re-pointing the intrinsic after boot would be re-pointing the guard.

**Two things measured and deliberately NOT changed.** An ambient enumerable
`Object.prototype` key was already filtered correctly — `hasOwn` is honest about
an object that does not lie — so the #1840 half was never part of this. And
three sibling loops in the same file keep `for…in` + `hasOwn`: instrumented with
markers against a Proxy handed to `navigate` and to `buildPath`, the caller's
object reached **none** of them, because `normalizeChannel` feeds them. They are
documented as dormant rather than edited, since no public path could pin the
change.

Cost, same-session A/B, medians, noisy at the ±3 ns level: a wash on an empty
bag, ~8 ns cheaper at one key, ~equal at three.

Part of #1901.
