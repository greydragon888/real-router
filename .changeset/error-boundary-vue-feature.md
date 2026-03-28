---
"@real-router/vue": minor
---

Add `RouterErrorBoundary` component for declarative navigation error handling (#366)

New `defineComponent` that shows a fallback alongside slot children when a navigation error occurs. Uses `watch({ immediate: true })` for `onError` callback, `computed` for visible error, and `shallowRef` for dismissed state. Auto-resets on successful navigation.
