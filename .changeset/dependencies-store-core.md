---
"@real-router/core": minor
---

Replace `DependenciesNamespace` class with plain `DependenciesStore` and inline CRUD logic into `getDependenciesApi` (#187)

**Breaking Change:** `RouterInternals` dependency entries replaced with single `dependenciesGetStore()` accessor. Plugins using `getInternals()` must migrate.

**What changed:**

- New `DependenciesStore<D>` interface — plain data object (`dependencies` + `limits`)
- `DependenciesNamespace` class eliminated — `createDependenciesStore()` factory replaces `new DependenciesNamespace()`
- CRUD logic (`set`, `setMultiple`, `checkDependencyCount`) moved into `getDependenciesApi.ts` as module-private functions
- `RouterInternals` reduced from 9 `dependency*` entries + `maxDependencies` to one `dependenciesGetStore()`
- Wiring accesses store directly (`dependenciesStore.dependencies[key]`) instead of class methods

**Migration (plugins using `getInternals()`):**

```diff
  const ctx = getInternals(router);
- const value = ctx.dependencyGet("myDep");
- const all = ctx.dependencyGetAll();
- ctx.dependencySet("myDep", value);
- const count = ctx.dependencyCount();
+ const store = ctx.dependenciesGetStore();
+ const value = store.dependencies["myDep"];
+ const all = { ...store.dependencies };
+ store.dependencies["myDep"] = value;
+ const count = Object.keys(store.dependencies).length;
```
