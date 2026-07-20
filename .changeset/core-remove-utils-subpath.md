---
"@real-router/core": minor
---

Remove the `@real-router/core/utils` subpath — moved to `@real-router/ssr-utils` (#1543)

**Breaking Change:** SSR/SSG/hydration helpers (`serializeState`,
`serializeRouterState`, `hydrateRouter`, `getStaticPaths`,
`createRequestScope`) are no longer available under `@real-router/core/utils`.

**Migration:**

```diff
- import { hydrateRouter, serializeRouterState } from "@real-router/core/utils";
+ import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
```

`SerializedRouterState` is now defined directly in `@real-router/core/types`
(and re-exported from `@real-router/ssr-utils`) — no import change needed for
consumers already importing it from `@real-router/core` or
`@real-router/core/types`.
