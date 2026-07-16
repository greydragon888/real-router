---
"@real-router/react": patch
---

Isolate a throwing `<Link>` onClick handler from navigation (#1436)

`<Link>` invoked the user's `onClick` handler with no exception isolation and before its own `preventDefault` + navigate, so a throwing handler propagated out of the click handler and silently aborted navigation. Native `<a>` logs a throwing click listener and still performs the default action; the handler is now wrapped in try/catch (logged via `console.error`), matching the codebase's consumer-callback isolation norm (vue's #1352, `InkLink` #799). The handler's own `preventDefault()` still blocks navigation (it runs before any throw), so the `defaultPrevented` contract is unchanged.
