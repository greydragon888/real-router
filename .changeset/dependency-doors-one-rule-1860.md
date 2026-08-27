---
"@real-router/core": minor
---

Every door that takes a dependency bag applies one rule (#1860)

`guardDependencies` is core's always-on structural check on a dependency bag —
non-plain-object and own enumerable getters are refused, the second so that an
application's code does not run while the router copies the bag. It had exactly
one call site: the constructor. The router has **three** doors that take such a
bag, and the other two never reached it.

`cloneRouter` merged the caller's argument into a fresh literal BEFORE the guard
ran, so the check was structurally vacuous with respect to the value it was meant
to judge. `setAll` reached no structural check at all. Measured, same input at
each door:

| bag                  | `createRouter` | `cloneRouter`          | `setAll`           |
| -------------------- | -------------- | ---------------------- | ------------------ |
| `"hi"`               | refused        | `{0:"h",1:"i"}`        | `{0:"h",1:"i"}`    |
| `new Service()`      | refused        | `{a:1}` — methods gone | `{a:1}`            |
| `new Map([["a",1]])` | refused        | **`{}`**               | **`{}`**           |
| `{ get g() {…} }`    | refused        | the getter **RAN**     | the getter **RAN** |

The `Map` row is the quiet one: every dependency the caller passed vanished with
no error. It matters most at `cloneRouter`, the documented per-request SSR path —
`@real-router/ssr-utils`'s `createRequestScope` and `@real-router/angular`'s
`providersFactory` both forward an application-authored bag straight into it.

**This is a behaviour change.** Passing a class instance, an array, a string, a
`Map` or a getter-bearing object to `cloneRouter` or `setAll` now throws a
`TypeError`, as it always has at `createRouter`. A dependency VALUE may still be
anything — a `Map`, a class instance, a pool; it is the BAG that must be a plain
object.

**A second, quieter change at `cloneRouter`:** an explicit `undefined` in the
caller's bag no longer removes the base's key. The merge was
`{ ...sourceDeps, ...dependencies }`, so `undefined` overwrote the inherited
value and the store's own skip then dropped both — `undefined` acted as "remove
this inherited dependency" at that one door. Core's rule is the opposite
everywhere else and is written down: a caller's explicit `undefined` means "I
said nothing" (#1550 / #1551), and `set(name, undefined)` is a documented no-op.
Measured: `cloneRouter(base, { boot: undefined })` on a base holding
`{ boot: "B", keep: 1 }` gave `{ keep: 1 }` and now gives `{ boot: "B", keep: 1 }`.
To drop an inherited dependency in a clone, call `remove` on the clone.
