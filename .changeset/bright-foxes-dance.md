---
"@real-router/core": minor
"@real-router/logger-plugin": patch
"@real-router/browser-plugin": patch
---

Add internal isomorphic logger package for centralized logging

- Create internal `logger` package with three severity levels (log, warn, error) and four threshold configurations (all, warn-error, error-only, none)
- Support optional callback for custom log processing with `callbackIgnoresLevel` option
- Add `options.logger` configuration support in `createRouter()` for global logger setup
- Migrate `@real-router/core` from direct `console.*` calls to centralized logger
- Migrate `@real-router/logger-plugin` to use internal logger instead of direct console output
- Migrate `@real-router/browser-plugin` warning messages to centralized logger
