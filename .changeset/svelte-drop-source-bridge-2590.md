---
"@real-router/svelte": minor
---

Remove `createReactiveSource` from the public entry (#2590)

It took a `RouterSource<T>`, so calling it meant importing `@real-router/sources` — the package the adapters are built on, not one an application uses. Read router state through the adapter's composables: `useRoute`, `useRouteNode`, `useRouterTransition`. They are built on the same bridge, which stays internal. A custom binding over `@real-router/sources` is adapter-author work.
