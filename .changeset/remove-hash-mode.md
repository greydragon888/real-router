---
"@real-router/browser-plugin": minor
---

BREAKING: Remove hash routing mode (#234)

Use `@real-router/hash-plugin` for hash-based routing.

- Remove `useHash`, `hashPrefix`, `preserveHash` options
- `BrowserPluginOptions` is now `{ forceDeactivate?, base? }`
- URL hash fragment (`#section`) is always preserved during navigation
- Invalid option types now throw `Error` instead of warning and falling back to defaults
