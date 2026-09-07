---
"@real-router/ssr-data-plugin": patch
---

Drop dead re-exports from the shared SSR barrel (#2150)

Internal refactor with no published API change: `shared/ssr/index.ts`
re-exported `ensureRegistryPromise`, `escapeForScript` and five loader types
that every consumer already imports from the module that declares them.
