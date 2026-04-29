---
"@real-router/react": minor
---

Add `hash` prop to `<Link>` (#532)

`<Link>` now accepts an optional `hash?: string` prop that builds a URL with
the fragment via the URL plugin's `router.buildUrl(name, params, { hash })`
extension and, on click, calls the new `navigateWithHash` helper. The helper
auto-bypasses SAME_STATES (`force: true, hashChange: true`) when the same
route is navigated to with a different fragment, so anchor-style same-path
links update both URL and `state.context.url.hashChanged`.

Plus an SSR-safety fix in scroll-restoration: `createScrollRestoration` now
reads the anchor target from `state.context.url.hash` (decoded, populated by
the URL plugins) rather than `globalThis.location.hash`, falling back to the
DOM only when no URL plugin is installed. This avoids race conditions between
React's commit and the browser's hash update.
