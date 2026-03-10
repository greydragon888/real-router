---
"@real-router/react": minor
---

Add `./legacy` subpath export for React 18+ compatibility (#257)

**BREAKING:** Main entry point (`@real-router/react`) now targets React 19.2+. React 18 users must switch to the legacy entry.

**Migration:**

```diff
- import { RouterProvider, useRouteNode, Link } from '@real-router/react';
+ import { RouterProvider, useRouteNode, Link } from '@real-router/react/legacy';
```

Both entry points share the same code and export the same API. The `/legacy` entry excludes future React 19.2-only components (e.g., `ActivityRouteNode`).
