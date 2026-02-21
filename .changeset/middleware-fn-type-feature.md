---
"@real-router/types": minor
---

Add MiddlewareFn type for post-commit middleware (#133)

Adds the `MiddlewareFn` type representing the new post-commit fire-and-forget middleware signature:

```typescript
import type { MiddlewareFn } from "@real-router/types";

// MiddlewareFn: (router) => (toState, fromState) => void | Promise<void>
const myMiddleware: MiddlewareFn = (router) => (toState, fromState) => {
  analytics.track(toState.name);
};
```

Unlike the old `Middleware = ActivationFn` alias, `MiddlewareFn` return values are ignored — middleware is purely for side effects.
