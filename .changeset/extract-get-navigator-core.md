---
"@real-router/core": minor
---

Extract `getNavigator` into standalone function (#83)

Extract `getNavigator` into standalone function. BREAKING: `Router.getNavigator()` method removed. Use `import { getNavigator } from '@real-router/core'` and call `getNavigator(router)` instead.
