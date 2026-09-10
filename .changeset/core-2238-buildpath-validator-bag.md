---
"@real-router/core": minor
---

`validateBuildPathArgs` takes the params bag beside the route name (#2238)

The `buildPath` door validated the route name and the bag through two calls that
never met, so no validator could ask a question about the pair. It now passes both
to `validateBuildPathArgs(route, params)` — two locals the door already holds, so
bare core evaluates nothing extra: optional chaining skips the call entirely while
no validator is installed.

`findMisChanneledKey` is re-exported from `@real-router/core/validation`, the
plugin-facing subpath that already carries the route-tree surface (#1301), so the
rule has one home. Its three carve-outs are the drift surface a copy would lose:
`undefined` is the removal marker, a name owning a path slot is absent from
`queryNames` by construction (#843 / #1549), and an accessor that throws is left
to the consumer that needed the value.
