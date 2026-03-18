---
"@real-router/core": minor
---

Add `@real-router/core/utils` subpath with `serializeState()` (#298)

New subpath export `@real-router/core/utils` with XSS-safe JSON serialization for embedding data in HTML `<script>` tags during SSR.

```typescript
import { serializeState } from "@real-router/core/utils";

const json = serializeState(data);
const html = `<script>window.__STATE__=${json}</script>`;
```

Escapes `<`, `>`, and `&` to Unicode equivalents to prevent `</script>` injection.
