---
"@real-router/solid": minor
---

Remove `createSignalFromSource` and `createStoreFromSource` from the public entry (#2590)

Both took a `RouterSource<T>`, so calling them meant importing `@real-router/sources` — the package the adapters are built on, not one an application uses. Read router state through the adapter's hooks: `useRoute`, `useRouteNode`, `useRouteStore`, `useRouteNodeStore`, `useRouterTransition`. They are built on the same two bridges, which stay internal. A custom binding over `@real-router/sources` is adapter-author work.
