---
"@real-router/core": minor
---

`RouterValidator` and `RouterInternals.validator` are removed (#2388)

**Breaking Change:** `@real-router/core` and `@real-router/core/validation` no
longer export the `RouterValidator` type, and `getInternals(router)` no longer
carries a `validator` member. Since 0.169.0 the type has declared no member and
core has read the slot nowhere. Core holds nothing for a validator — a refusal
is a check at a named position, and a report is a diagnostic kind.

**Migration:** drop the type and the slot, and register on the channels:

```diff
- import type { RouterValidator } from "@real-router/core/validation";
- getInternals(router).validator = myValidator;
+ const api = getPluginApi(router);
+
+ api.addCheck("buildPath:entry", (route, params, search) => { … });
+ api.subscribeDiagnostic("BUILD_PATH", (routeName, params) => { … });
```
