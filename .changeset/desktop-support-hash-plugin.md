---
"@real-router/hash-plugin": minor
---

Desktop environments support (Electron, Tauri) (#496)

`safeParseUrl` (shared with `browser-plugin` and `navigation-plugin`) no longer depends on `globalThis.location.origin` and no longer filters by scheme. Hash routing now works uniformly in Electron `file://` mode (where `location.origin === "null"` previously caused `TypeError`), Tauri webviews, and any other webview that may ship with non-HTTP origins.

**What changed**

- `hashUrlToPath` now returns `string` (never `null`) — the parser is total.
- Scheme whitelist removed. Any URL with a hash fragment is parsed, regardless of scheme.

**Migration**

No source changes required. `hash-plugin` remains the safest option for Electron apps that cannot configure a custom protocol handler — hash routing never hits the `SecurityError` that History API triggers on `file://`.
