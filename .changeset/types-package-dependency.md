---
"@real-router/core": patch
"@real-router/browser-plugin": patch
"@real-router/helpers": patch
"@real-router/logger-plugin": patch
"@real-router/persistent-params-plugin": patch
"@real-router/react": patch
---

fix: use @real-router/types for shared type definitions

All packages now import types from @real-router/types instead of bundling
their own copies. This fixes TypeScript type compatibility issues when
using multiple @real-router packages together.
