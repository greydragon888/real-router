---
"@real-router/core": patch
---

Align PluginsNamespace and MiddlewareNamespace patterns (#129)

Internal consistency refactoring across the two extension namespaces:

- **`validateNoDuplicates`**: Middleware now uses callback pattern (`has`) instead of allocating a `Set` from array on every call
- **Error messages**: Plugins now include index in args validation and counts in limit errors, using `getTypeDescription()` instead of raw `typeof`
- **Threshold warnings**: Plugin warnings now include actionable context (hard limit value, guidance), matching middleware style
- **Logger context**: Middleware logger context extracted to a `LOGGER_CONTEXT` constant in `constants.ts`
- **`disposeAll` / `clearAll`**: Added JSDoc documenting the semantic distinction between the two operations
