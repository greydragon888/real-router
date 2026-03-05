---
"@real-router/browser-plugin": minor
---

BREAKING: Remove hash routing mode. Use `@real-router/hash-plugin` for hash-based routing.

- Remove `useHash`, `hashPrefix`, `preserveHash` options
- `BrowserPluginOptions` is now a flat interface with `forceDeactivate` and `base`
- URL hash fragment (`#section`) is now always preserved when navigating within the same path
- Invalid option types now throw Error instead of warning and falling back to defaults
