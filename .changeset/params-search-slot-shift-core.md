---
"@real-router/core": minor
---

RFC-4 M2: split navigation into path (`params`) and query (`search`) channels (#1548)

`State.params` now carries **only** path params; query params move to the new
`State.search` channel (always present — a frozen `{}` when empty). Match results,
`makeState`, and the navigate/build pipeline are search-aware end to end.

**Breaking (pre-1.0, positional slot-shift):**

- `navigate` gains two equal-standing forms — descriptor `navigate(target, opts?)`
  (where `target: NavigationTarget = { name, params?, search? }`) and positional
  `navigate(name, params?, search?, opts?)`. The v1 `navigate(name, params, opts)`
  form is gone: options move from position 3 to position 4.
- `isActiveRoute(name, params?, search?, strictEquality?, ignoreQueryParams?)` —
  the query channel is inserted at position 3; `strictEquality` / `ignoreQueryParams`
  shift to 4 / 5.

**Additive:**

- `buildPath(route, params?, search?)` and `canNavigateTo(name, params?, search?)`
  accept an explicit query channel. `buildPath` is now search-aware, so a colliding
  declaration `/items/:id?id` builds `/items/5?id=7` (path and a same-named query
  param keep their own slots — the killed #843 precedence).
- New `NavigationTarget<P, S>` type exported from `@real-router/core` (and `/types`).
- New `createTernaryInterceptable`; the `buildPath` interceptable is now
  three-argument (search-aware). Legacy two-arg `buildPath`/`forwardState`
  interceptors remain valid.
