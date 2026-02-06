---
"@real-router/core": minor
---

Remove `router[Symbol.observable]()` from core — Observable API moved to `@real-router/rx` (#41)

**Breaking Change:** `router[Symbol.observable]()` and `router["@@observable"]()` are removed from core.

**Migration:**

```typescript
// Before
router[Symbol.observable]().subscribe(observer);

// After
import { observable } from "@real-router/rx";
observable(router).subscribe(observer);

// Or with state stream
import { state$ } from "@real-router/rx";
state$(router).subscribe((state) => console.log(state));
```

**Why:** Achieves zero bundle cost for users who don't need reactive streams (~2KB savings).
