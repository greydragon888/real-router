---
"@real-router/core": patch
---

Read `limits` once, at construction, and let a clone inherit them (#1875, #1880)

**Who is affected:** callers whose `limits` are not plain numbers — a value with
a `valueOf`, or an accessor on the `limits` bag. The first needs a cast in
TypeScript; the second does **not**, because a getter is structurally a `number`
property, so it is reachable from ordinary typed code. Their exposures differ,
and the difference is measured:

A **`valueOf`-backed value** was read once per **listener registration**, for the
router's whole life: `EventEmitter` compares with `size >= maxListeners`, which
runs `ToPrimitive`. One that answered differently silently moved the cap at
runtime; one that threw, threw out of `subscribe()`.

An **accessor on the bag** was not — the old `createLimits` spread invoked it
once at construction and stored the result. It was re-read once per
`cloneRouter`, so a per-request SSR clone could end up with a different cap from
its base: measured, the base admitted three subscribers while the clone threw
`Listener limit (1) reached` from one options object.

`createLimits` now coerces each limit once and hands numbers downstream, and a
clone inherits the base's resolved limits rather than re-reading the option.

**Behaviour changes worth knowing about:**

- **A falsy non-number no longer breaks every registration.** `null`, `""`,
  `false` and `[]` all coerce to `0`, which is the documented spelling of "no
  cap". Before, each of them made _every_ `subscribe()` throw
  `Listener limit (null) reached` and friends — a config that spells an unset
  limit the way `JSON.parse` does was unusable. `undefined`, `Infinity` and a
  non-numeric string like `"abc"` continue to mean "no cap", as before.
- **A `valueOf` that throws now throws from `createRouter`.** For
  `maxListeners` that is a RELOCATED throw — it used to come out of an unrelated
  later `subscribe()`. For the other four it is a **new** failure, and worth
  saying plainly: `warnListeners` is compared with `===`, which runs no
  `ToPrimitive`, and `maxDependencies` / `maxPlugins` / `maxLifecycleHandlers`
  are read only behind `@real-router/validation-plugin` — so on bare core a
  throwing `valueOf` on any of those four was invoked **zero times, ever**, and
  the application ran end to end. It now fails at boot. A `Symbol` limit behaves
  the same way. Neither is a rejection the router invents — a limit that merely
  fails to become a usable NUMBER is coerced, never refused — but the population
  whose `ToPrimitive` throws is newly fatal on four of the five limits.
- **The `Listener limit (X) reached` message now prints the resolved number.**
  It used to print the raw value — `(true)`, `([object Object])`, a `Date`'s
  full text. If you match on that message, it changed.
- **The warning channel now works for a non-number `warnListeners`.** The check
  is `size === warnListeners`, which could never be true for a non-number, so
  such a config warned exactly never. It warns now.
- **If you pass `limits`, a clone's `getOptions().limits` reports the resolved
  numbers** for the keys you passed, where the base still reports the object you
  passed. The clone does not gain the defaults for keys you left out, and it
  keeps only keys that name a real limit — an own key outside `Limits` is
  reported by the base and dropped by the clone.

⚠ `@real-router/validation-plugin` still reads `getOptions().limits` once per
registration it validates. On the BASE that is the caller's own bag and the path
is unchanged. On a CLONE it is now the substituted object, which is the point of
#1880 — a drifting accessor used to give the clone a different verdict from its
base.

⚠ With the validator installed, `null` / `""` / `false` / `[]` and an unknown own
key are all still refused at install. "A config that spells an unset limit the
way `JSON.parse` does was unusable" becomes usable in **bare core**; with the
plugin it is still reported, which is the intended posture.
