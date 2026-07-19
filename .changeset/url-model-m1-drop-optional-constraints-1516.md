---
"@real-router/core": minor
---

Simplify the route-path grammar to three tokens — `static`, `:param`, `*splat` (#1516, URL model v2 / milestone 1)

Optional params (`:tab?`, `*rest?`) and regex constraints (`:id<\d+>`) are **removed** from the path grammar. A path using either form is now rejected at registration with an actionable replacement recipe:

- **Optional params** → declare two sibling routes instead (the route hierarchy already expresses optionality): `"/profile/:tab?"` becomes `"/profile"` + `"/profile/:tab"`.
- **Regex constraints** (`<`/`>` are now reserved in path segments) → match the segment as a plain string and validate the value in a guard (`canActivate`) or app code.

The demolition collapses this axis's largest cluster of grammar edge-cases (unbalanced/empty/fused constraints, optional-before-splat, optional-splat) into two clear rejections. Bare core carries a short recipe; `@real-router/validation-plugin` surfaces the rich, route-contextual recipe (with computed sibling paths) — the heavy validation stays plugin-gated, off the hot path.
