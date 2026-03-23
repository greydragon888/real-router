---
"@real-router/svelte": minor
---

Add `Lazy` component for code-splitting support (#325)

New `<Lazy>` component for lazy-loading route content with a fallback while loading. Accepts `loader` (dynamic import function) and optional `fallback` (component to show while loading).
