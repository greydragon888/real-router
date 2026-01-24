---
"@real-router/core": patch
"@real-router/browser-plugin": patch
"@real-router/helpers": patch
"@real-router/logger-plugin": patch
"@real-router/persistent-params-plugin": patch
"@real-router/react": patch
---

fix: resolve workspace:^ dependencies correctly in published packages

Previously, workspace:^ dependencies were published to npm as-is, causing
installation failures. Now workspace protocols are replaced with actual
version numbers before publishing.
