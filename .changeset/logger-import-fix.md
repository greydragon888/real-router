---
"@real-router/core": patch
---

Fix bare logger imports causing double bundle inline

Replace `import { logger } from "logger"` with `from "@real-router/logger"` in `executeMiddleware.ts` and `executeLifecycleHooks.ts` to prevent the logger module from being inlined twice in the bundle.
