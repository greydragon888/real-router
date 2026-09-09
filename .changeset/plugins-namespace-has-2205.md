---
"@real-router/core": patch
---

Remove `PluginsNamespace.has`, an internal method with no callers

The method shipped in every bundle and was called from nowhere — not from `src`, not from a test, not from a plugin, not from `examples` or `shared`. Its only two lookalikes in the tree are local `Set`s: `cloneRouter.ts:389` and `PluginsNamespace.ts:224`.

Its `/* v8 ignore next 3 */` justified the uncovered line with `@preserve: only called via validator interface, not reachable without validation plugin`, and the validator interface disproves it three files away: `validateNoDuplicatePlugins` takes `(factory: unknown, factories: unknown[])`, an ARRAY, and the one call site hands it `this.#plugins.getAll()` — the very allocation the method's docblock said it existed to avoid. The plugin's implementation is `factories.includes(factory)`. So there was no interface through which it could be called, with or without the validation plugin.

`PluginsNamespace` is exported from no entry point — not `index.ts`, not `internals.ts`, not `validation.ts` — so nothing outside core could reach it either, and no published surface changes. `count()` and `getAll()` stay live; this is not a CRUD set losing a member.

Measured in the shipped bundle: the minified body `has(e){return this.#e.has(e)}` occurs exactly once in `dist/esm/Router-*.mjs` and is 29 bytes.

Closes #2205.
