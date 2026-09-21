---
"@real-router/vue": patch
---

Remove the `useIsActiveRoute` composable, which nothing called (#2425)

It was never exported from `@real-router/vue` and no module imported it — its only importer was its own test — so no published surface changes. `<Link>` resolves active state through `createActiveSource` in its reactive `watch`, which is what it already did.
