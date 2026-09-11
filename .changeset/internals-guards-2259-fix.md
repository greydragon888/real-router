---
"@real-router/core": patch
---

An internal door refuses what its guarded sibling refuses (#2259)

`@real-router/core/validation` publishes `getInternals`, and the doors it hands
out reached the same primitives as `PluginApi` while skipping the guards the
facade ran. Measured with the parity census in `@real-router/validation-plugin`:
5 bypasses across 3 doors in bare core, 11 across 7 once the validation plugin
was installed — the gap WIDENED with validation, because most facade guards are
`ctx.validator?.…`.

The guards now live on the `RouterInternals` adapters, so both doors run them:
`addEventListener`, `makeState`, `matchPath`, `navigateToState`, `setRootPath`
and `navigateToNotFound`. Bare core is down to zero bypasses; with the plugin,
two remain and both are `forwardState`.

⚠ `forwardState` keeps its guards on the facade, and that is the one exception
the decision makes. Core reaches that seam itself — `matchPath` resolves a
forward through it — so moving them down fires `validateStateBuilderArgs` on an
internal intermediate, which core pins as deliberately NOT validated. Where a
door is reached internally, the adapter is not a boundary.

Nothing is removed and no signature changes: a call that was accepted for a
well-formed argument is accepted still. What changes is that a malformed one is
now refused from either side rather than only from `PluginApi`.
