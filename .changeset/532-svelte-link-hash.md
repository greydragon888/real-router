---
"@real-router/svelte": minor
---

Add `hash` support to `<Link>` and `useIsActiveRoute` (#532)

- `<Link>` accepts an optional `hash?: string` prop that builds a URL with
  the fragment via the URL plugin's `router.buildUrl(name, params, { hash })`
  extension and, on click, calls the `navigateWithHash` helper. The helper
  auto-bypasses SAME_STATES (`force: true, hashChange: true`) when the same
  route is navigated to with a different fragment, so anchor-style same-path
  links update both URL and `state.context.url.hashChanged`.
- `useIsActiveRoute(name, params, strict, ignoreQueryParams, hash?)` gains
  an optional fifth `hash` argument. When provided, the composable's
  `current` is `true` iff the route matches AND `state.context.url.hash`
  equals the requested fragment exactly — distinct hashes get distinct
  cache entries in `@real-router/sources` (see its changeset).
