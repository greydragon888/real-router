---
"@real-router/core": minor
---

Make `getRoutesApi` route mutations atomic (#698)

`add`, `replace`, and `update` previously mutated the route store before running
steps that can throw (circular/async `forwardTo`, invalid path constraint) and had
no rollback, so without `@real-router/validation-plugin` a failed call left a torn
store: a duplicate name silently overwrote a live route, a failed `replace` lost the
whole tree, and a cycle-creating `update({ forwardTo })` poisoned the forward map so a
later unrelated `add` threw.

`add` and `replace` now build the new tree, config, and forward map into local
structures and only swap them into the store once the build has fully succeeded — so
a rejected call throws and leaves the existing routes untouched. `update({ forwardTo })`
resolves the forward chain on a candidate map before committing, so a cycle no longer
corrupts state. Adding a route whose name already exists, or under a missing `parent`,
now throws a clear error instead of silently overwriting a live route or crashing with
a `TypeError`, regardless of whether the validation plugin is installed.
