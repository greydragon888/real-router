---
"@real-router/core": minor
---

Add `navigateToNotFound()` method and export `UNKNOWN_ROUTE` constant (#241)

New synchronous `router.navigateToNotFound(path?: string): State` method that replaces the current state with `UNKNOWN_ROUTE` without changing the URL. Emits a transition success event with full transition metadata (deactivated/activated segments) for contextual 404 pages.

```typescript
import { UNKNOWN_ROUTE } from "@real-router/core";

const state = router.navigateToNotFound("/missing-page");
// state.name === UNKNOWN_ROUTE
// state.path === "/missing-page"
// state.params === {}
// state.transition.segments.deactivated — previously active segments
```

**Breaking Change:** `start()` with an unknown path now produces `state.params === {}` instead of `state.params === { path: "/..." }`. The path is available via `state.path`.
