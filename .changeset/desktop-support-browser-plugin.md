---
"@real-router/browser-plugin": minor
---

Desktop environments support (Electron, Tauri) (#496)

`safeParseUrl` no longer depends on `globalThis.location.origin` and no longer filters by scheme. The plugin now works out of the box in Electron (`app://`, `file://` with custom protocol) and Tauri (`tauri://`, `https://tauri.localhost`, `asset://`).

**What changed**

- Removed `new URL(url, globalThis.location.origin)` — previously threw `TypeError` on `file://` where `location.origin === "null"`.
- Removed HTTP(S) protocol whitelist — arbitrary schemes (`tauri://`, `app://`, `custom-protocol://`, …) now pass through.
- `matchUrl()` is now scheme-agnostic: it extracts `pathname + search + hash` and routes on the path alone. Security against malicious URLs comes from route matching (unknown paths return `undefined`), not from scheme filtering.

**Migration**

No source changes required. If you relied on the `"Invalid URL protocol"` warning to reject non-HTTP URLs, route-level matching now handles this — `router.matchUrl("javascript:alert(1)")` still returns `undefined`.
