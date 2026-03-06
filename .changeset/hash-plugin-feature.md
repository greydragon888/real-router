---
"@real-router/hash-plugin": minor
---

Standalone hash-based routing plugin (#234)

New `@real-router/hash-plugin` package for hash-based routing (`example.com/#/path`).

```typescript
import { hashPluginFactory } from "@real-router/hash-plugin";

router.usePlugin(hashPluginFactory({ hashPrefix: "!", base: "/app" }));
```

- `hashPrefix` — character after `#` (default: `""`, e.g. `"!"` for `#!/path`)
- `base` — base path prefix (default: `""`)
- `forceDeactivate` — force deactivation on navigation (default: `false`)
