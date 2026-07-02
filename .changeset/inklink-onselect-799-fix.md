---
"@real-router/react": patch
---

Isolate a throwing `onSelect` in `InkLink` (#799)

A throwing `onSelect` on `<InkLink>` no longer swallows the navigation nor escapes into ink's `useInput` stdin handler — an `uncaughtException` there would crash a real CLI, since Node has no browser-style event-listener isolation. The callback is now wrapped in try/catch: the error is logged via `console.error` and navigation still proceeds, mirroring `route-announcer`'s consumer-callback isolation.
