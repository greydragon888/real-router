---
"@real-router/react": minor
---

Add `RouterErrorBoundary` component for declarative navigation error handling (#366)

New component that shows a fallback **alongside** children when a navigation error occurs (guard rejection, route not found). Auto-resets on successful navigation. Supports manual dismiss via `resetError()` and side-effect logging via `onError` callback. Available from both `@real-router/react` and `@real-router/react/legacy`.
