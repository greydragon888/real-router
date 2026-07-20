---
"@real-router/core": patch
---

Fix plugin `StateContext` / `NavigationOptions` module augmentation being silently dropped for external consumers resolving `dist` (#1540)

`declare module "@real-router/core/types"` merges only when the resolved module is the interface's lexical declaration-site — a re-export barrel of any form is a silent no-op (#1519). The bundled dts hoisted `StateContext` / `NavigationOptions` into a shared chunk (regressed by the foundation fold, #1520), so every plugin's typed `state.context.<namespace>` and `NavigationOptions` extension degraded to `{}` for dist-resolving consumers, while `src`-resolving monorepo CI stayed green.

The fix is two-fold and does not change the JS output at all:

- the augment-target interfaces are now declared lexically in `src/types/index.ts` (the `@real-router/core/types` entry) instead of `types/base.ts`;
- core's build is split into two phases — JS stays bundled (package shape and weight unchanged), dts is emitted unbundled (`preserveModules`), so `dist/*/types.d.*` IS the entry module with the lexical declarations.

A post-bundle check (`scripts/check-dts-augment-targets.mjs`) now fails the build if the types entry ever becomes a re-export barrel again or a duplicate declaration splits the type into two symbols.
