---
"@real-router/core": patch
---

Update documentation for modular architecture (#187)

- **core/README.md**: Rewrite API reference — Promise-based navigation, standalone API functions (`getRoutesApi`, `getDependenciesApi`, `getLifecycleApi`, `getPluginApi`, `cloneRouter`), remove callback-based examples, add `dispose()`, update error codes
- **ARCHITECTURE.md**: Update package dependency diagram, split internal packages (bundled vs separate), add standalone API section, update SSR example to `cloneRouter()`
- **IMPLEMENTATION_NOTES.md**: Update namespace structure (Router.ts ~640 lines, `api/` folder, store pattern), add "Standalone API Extraction" section
- **README.md**: Update React example (`useRouteNode` instead of `useRoute`)
