---
"@real-router/core": patch
---

The guard-origin argument is required, so every caller commits to a lane (#1977)

`RouteLifecycleNamespace.addCanActivate` / `addCanDeactivate` defaulted their
`isFromDefinition` argument to `false` — the MINORITY polarity, since three of
the four in-repo callers are the definition lane and had to remember `true`. The
sibling clear API states the opposite rule for itself: *"there is no origin-blind
default, so every caller commits to a lane and a new call site cannot silently
clear both"* (#1171).

Measured: a definition-lane registration that omits the argument files the guard
in the EXTERNAL map, where `clearDefinitionGuards()` does not reach it — so
`replace()` keeps a guard belonging to a tree that no longer exists (1 surviving
guard, against 0 for the same call with the argument). The type could not catch
it while the parameter was optional.

The public surface is unchanged: `getLifecycleApi().addActivateGuard(name,
handler)` still takes two arguments and still registers on the external lane —
it now names that lane instead of defaulting into it. Only the internal namespace
signature changed; a TypeScript caller reaching it through
`@real-router/core/validation` gets a compile error and one added argument, and
runtime behaviour is identical either way.
