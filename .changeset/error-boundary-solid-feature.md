---
"@real-router/solid": minor
---

Add `RouterErrorBoundary` component for declarative navigation error handling (#366)

New component that shows a fallback alongside children when a navigation error occurs. Uses Solid signals (`createSignal`, `createMemo`, `createEffect`) for fine-grained reactivity. Auto-resets on successful navigation.
