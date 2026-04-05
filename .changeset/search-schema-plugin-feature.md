---
"@real-router/search-schema-plugin": minor
---

Add `@real-router/search-schema-plugin` — runtime search parameter validation via Standard Schema V1 (#406)

New plugin that validates search parameters against Standard Schema V1 (Zod 3.24+, Valibot 1.0+, ArkType) using the `forwardState` interceptor. 

Features:
- Automatic strip of invalid params + merge with `defaultParams` for recovery
- `mode: "development"` (console.error) / `"production"` (silent strip)
- `strict` mode to remove unknown params
- Custom `onError` callback for full control
- Dev-time `defaultParams` validation at `usePlugin()` time
- Dynamic route validation via `add` interceptor
