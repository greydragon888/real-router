---
"@real-router/vue": patch
---

fix(vue): isolate a throwing `<Link>` @click handler from navigation (#1352)

`<Link>` invoked the user's `@click` handler(s) with no exception isolation and
before its own `preventDefault` + navigate, so a throwing handler propagated out
of `handleClick` and the navigation never ran — a throwing `onClick` silently
prevented the Link from navigating, and in the array form (Vue's compiled
multi-handler / `v-on` merge) it also aborted the remaining sibling handlers.
Each user handler now runs through `invokeUserOnClick` (try/catch →
`console.error` + continue), matching native `<a>` (logs a throwing click
listener, still performs the default action) and the codebase's adapter-callback
isolation norm. The handler's own `preventDefault()` still blocks navigation (it
runs before any throw), so the `defaultPrevented` contract is unchanged.
