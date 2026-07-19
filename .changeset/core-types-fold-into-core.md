---
"@real-router/core": minor
---

Fold `@real-router/types` into `@real-router/core` (#1520)

The standalone `@real-router/types` package is dissolved: its types now ship **with**
`@real-router/core`. Import them from the package root (`import type { State, Params } from
"@real-router/core"`), and augment typed `state.context` namespaces via the new
`@real-router/core/types` subpath:

```ts
declare module "@real-router/core/types" {
  interface StateContext {
    myPlugin: { … };
  }
}
```

**Breaking for external augmentors:** retarget `declare module "@real-router/types"` →
`declare module "@real-router/core/types"`. Note the root exports the `Router` / `RouterError`
**classes**; import the `Router` **interface** (e.g. for typing a `PluginFactory` param) from
`@real-router/core/types`. Folding types into core also ties their identity to the core
version, eliminating the two-copies / split-brain-augmentation drift class.
