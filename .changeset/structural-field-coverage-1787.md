---
"@real-router/validation-plugin": minor
---

Structural-field type checks cover every field at every registration door (#1787)

`defaultSearch` was unknown to this package entirely — no check on any of the
four doors — and `forwardTo` was type-checked at `update` but not at `add` /
`replace`, where a number fell through the async branch's `typeof` test and out
the other side. A string `defaultSearch` therefore spread character by character
into the query channel on every navigation and every `buildPath`, with the
plugin installed.

Closed: the `defaultSearch` row at all four doors, `forwardTo`'s type at
`add` / `replace`, and `canActivate` / `canDeactivate` at `update` — the last
because `RouteConfigUpdate` declares them as `GuardFnFactory | null`, with no
boolean, unlike `addActivateGuard` whose handler may be one.

⚠ **The acceptance criterion is a CLASSIFICATION, not "zero accepts", and the
new test derives it.** Over 7 fields × 4 doors × 6 junk values, measured twice
per cell (bare core as the control, then with the plugin), 168 cells fall into
four outcomes: refused by core, refused by this plugin, type-VALID, or
structurally unreachable. Only a fifth would be a defect — admitted by both
while the caller's own value sits in the store, inspectable — and there are none.

Two mechanisms put a cell out of reach, and the test measures both rather than
listing them: core drops a falsy structural field before anything is stored, and
wraps a codec in a closure so the slot holds a function whatever was passed. In
both cases the value this package would judge no longer exists by the time it
installs, because it installs through `usePlugin` — after construction.

⚑ `forwardTo: ""` is classified **valid**, not fixed. It is a `string`, so
refusing it is a semantic rule rather than a type one, and core already drops it
at registration (#1797).

Also here, because it is why the gap existed: `LocalRouteConfig` — this package's
hand-written mirror of core's `RouteConfig` — was short by the same slot, so
`defaultSearch` was invisible to the retrospective pass at the type level too.
Adding a slot in core still reds nothing here; the coverage test is what notices.

`validateUpdateRoutePropertyTypes` now takes a record instead of seven
positional `unknown`s, where a transposition compiled fine.
