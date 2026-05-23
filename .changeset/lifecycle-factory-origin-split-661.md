---
"@real-router/core": patch
---

Lift guard origin to a primary invariant in `RouteLifecycleNamespace` (#661)

`RouteLifecycleNamespace` previously stored canActivate / canDeactivate
factories in a single Map per kind and tracked "is this guard from a
route definition vs added externally" via auxiliary `Set<string>`
collections. Origin was a derived, Set-tracked property that the public
API had to reconstruct, with a handful of subtle consequences for
`removeActivateGuard`, `replace()`, and `cloneRouter`.

Storage is now split per origin: `#definitionActivateFactories` /
`#externalActivateFactories` (and symmetric pair for deactivate). The
compiled-function view preserves the pre-refactor "last add wins"
runtime semantic; on partial clear it falls back to whichever origin
Map still holds the slot.

Behavioural changes:

- `clearCanActivate(name, origin?)` / `clearCanDeactivate(name, origin?)`
  accept an optional `origin` filter (`"definition"` / `"external"`).
  Default behaviour (no filter) is unchanged — both slots cleared.
- `getFactoriesByOrigin()` added for `cloneRouter` consumption — returns
  `{ definition: [deactivate, activate], external: [deactivate, activate] }`
  so clones re-register guards with the original origin flag preserved.
  `replace()` on the clone now correctly strips inherited definition
  guards via `clearDefinitionGuards()`.
- `getFactories()` retains its `[deactivate, activate]` flat shape with
  external winning over definition for the same slot — backward compatible
  with `getRoutesApi` and the route-removal cleanup path.

Non-goals: this refactor does not address closure-sharing across
clones (`base.deps` / `base.externalGuards` shared by reference — see
#664 for the documented SSR usage rule: singletons → base, per-request
→ clone via the override slot or `createRequestScope`).
