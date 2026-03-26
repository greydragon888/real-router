---
"@real-router/core": minor
---

Add `getStaticPaths()` utility for SSG pre-rendering (#335)

New `getStaticPaths(router, entries?)` function in `@real-router/core/utils` enumerates all leaf routes from the router tree and builds their URLs. For dynamic routes (`:id`), accepts an `entries` map providing parameter sets to pre-render.

```typescript
import { getStaticPaths } from "@real-router/core/utils";

const paths = await getStaticPaths(router, {
  "users.profile": async () => [{ id: "1" }, { id: "2" }],
});
// → ["/", "/users", "/users/1", "/users/2"]
```

Also exports `StaticPathEntries` type for the `entries` parameter.
