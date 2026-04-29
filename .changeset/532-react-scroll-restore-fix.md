---
"@real-router/react": patch
---

SSR-safe anchor lookup in `createScrollRestoration` (#532)

`createScrollRestoration` now reads the anchor target from
`state.context.url.hash` (decoded, populated by the URL plugins) rather than
`globalThis.location.hash`, falling back to the DOM only when no URL plugin
is installed. This avoids race conditions between React's commit and the
browser's hash update.
