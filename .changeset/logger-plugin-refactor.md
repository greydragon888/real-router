---
"@real-router/logger-plugin": minor
---

Align logger-plugin with plugin architecture conventions (#250)

**BREAKING CHANGE:** Removed `loggerPlugin` singleton export. Use `loggerPluginFactory()` instead.

**Migration:**

```diff
- import { loggerPlugin } from "@real-router/logger-plugin";
- router.usePlugin(loggerPlugin);
+ import { loggerPluginFactory } from "@real-router/logger-plugin";
+ router.usePlugin(loggerPluginFactory());
```

Internal changes: converted closure to `LoggerPlugin` class with `getPlugin()` pattern, extracted factory.ts, added options validation, added LOGGER_CONTEXT/ERROR_PREFIX constants, fixed stale path comments.
