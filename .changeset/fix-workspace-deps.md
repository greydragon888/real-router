---
"@real-router/core": patch
"@real-router/browser-plugin": patch
"@real-router/helpers": patch
"@real-router/logger-plugin": patch
"@real-router/persistent-params-plugin": patch
"@real-router/react": patch
---

fix: resolve workspace:^ dependencies to actual versions

Previous release published packages with unresolved workspace:^ protocol
in dependencies, causing npm install to fail. This release fixes the
issue by using pnpm publish which correctly converts workspace references.
