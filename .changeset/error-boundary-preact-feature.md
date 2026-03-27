---
"@real-router/preact": minor
---

Add `RouterErrorBoundary` component for declarative navigation error handling (#366)

New component that shows a fallback alongside children when a navigation error occurs. Auto-resets on successful navigation. Supports `resetError()` for manual dismiss and `onError` callback for logging.
