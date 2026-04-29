---
"@real-router/svelte": patch
---

SSR-safe anchor lookup in `createScrollRestoration` (#532)

`createScrollRestoration` now reads the anchor target from
`state.context.url.hash` (decoded, populated by the URL plugins) when
available, falling back to `globalThis.location.hash` otherwise. Removes a
race between the adapter's commit and the browser's hash update.
