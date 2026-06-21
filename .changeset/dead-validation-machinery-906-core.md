---
"@real-router/core": minor
---

Remove dead validation machinery (#906)

Removes three never-used pieces of validation scaffolding surfaced by the architecture review (finding 2.1):

- `RouteLifecycleNamespace.#registering` — a `Set` written (`.add`/`.delete`) but never read
- `RouterValidator.lifecycle.validateNotRegistering` — interface member never called by core
- `PluginsNamespace.validateNoDuplicatePlugins` static method — never called (the live duplicate check is the `RouterValidator.plugins.validateNoDuplicatePlugins` member, left untouched)

**Breaking (type-only):** the `validateNotRegistering` member is removed from the exported `RouterValidator` interface. No runtime behavior changes — none of the removed code was on an execution path.
