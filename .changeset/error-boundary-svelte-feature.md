---
"@real-router/svelte": minor
---

Add `RouterErrorBoundary` component for declarative navigation error handling (#366)

New Svelte 5 component using Runes (`$state`, `$derived`, `$effect`) and Snippets for typed fallback rendering. Shows a fallback alongside children when a navigation error occurs. Uses `untrack()` for `onError` callback stability. Auto-resets on successful navigation.
