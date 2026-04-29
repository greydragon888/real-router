---
"@real-router/angular": minor
---

Add `hash` input to `[realLink]` directive (#532)

The `realLink` directive now exposes a signal `hash` input
(`input<string | undefined>(undefined)`) that builds a URL with the fragment
via the URL plugin's `router.buildUrl(name, params, { hash })` extension and,
on click, calls the `navigateWithHash` helper. The helper auto-bypasses
SAME_STATES (`force: true, hashChange: true`) when the same route is
navigated to with a different fragment, so anchor-style same-path links
update both URL and `state.context.url.hashChanged`.

Plus an SSR-safety improvement in scroll-restoration: `createScrollRestoration`
now reads the anchor target from `state.context.url.hash` (decoded, populated
by the URL plugins) when available, falling back to `globalThis.location.hash`
otherwise. Removes a race between the adapter's commit and the browser's hash
update.

```html
<a realLink routeName="docs" hash="section">Docs</a>
```
