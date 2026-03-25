---
"@real-router/validation-plugin": minor
---

New package: extract DX validation from core into opt-in plugin (#334)

`@real-router/validation-plugin` provides the full validation layer previously built into `@real-router/core`. Register before `router.start()` to enable descriptive type errors and argument checks across all router operations.

```typescript
import { validationPlugin } from "@real-router/validation-plugin";

const router = createRouter(routes);
router.usePlugin(validationPlugin()); // opt in to DX validation
await router.start();
```

The plugin runs retrospective validation at registration time, catching route tree errors that occurred before `usePlugin()` was called.
