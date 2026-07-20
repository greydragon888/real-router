---
"@real-router/angular": patch
---

Update SSR helper import to `@real-router/ssr-utils` (#1543)

Internal refactor — `provideRealRouterFactory`'s use of `hydrateRouter` /
`serializeRouterState` now comes from the new `@real-router/ssr-utils`
package instead of the removed `@real-router/core/utils` subpath. No public
API change; `@real-router/ssr-utils` is added as a runtime dependency.
