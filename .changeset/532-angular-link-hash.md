---
"@real-router/angular": minor
---

Add `hash` support to `[realLink]` and `injectIsActiveRoute` (#532)

- The `realLink` directive exposes a signal `hash` input
  (`input<string | undefined>(undefined)`) that builds a URL with the
  fragment via the URL plugin's `router.buildUrl(name, params, { hash })`
  extension and, on click, calls the `navigateWithHash` helper. The helper
  auto-bypasses SAME_STATES (`force: true, hashChange: true`) when the same
  route is navigated to with a different fragment, so anchor-style same-path
  links update both URL and `state.context.url.hashChanged`.
- `injectIsActiveRoute(name, params, { strict?, ignoreQueryParams?, hash? })`
  accepts an optional `hash` field. When provided, the returned
  `Signal<boolean>` is `true` iff the route matches AND
  `state.context.url.hash` equals the requested fragment exactly — distinct
  hashes get distinct cache entries in `@real-router/sources` (see its
  changeset).

```html
<a realLink routeName="docs" hash="section">Docs</a>
```
