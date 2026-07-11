---
"@real-router/hash-plugin": patch
---

fix(hash-plugin): preserve the typed URL on a 404 popstate (#1229)

`onTransitionSuccess` rebuilt the address-bar URL from `buildUrl(toState.name, toState.params)`; for `UNKNOWN_ROUTE` `buildPath` returns `""`, so the URL collapsed to the bare prefix (`#!`) and the typed 404 path was lost — a refresh then re-started from `#!` and silently landed on `home`. It now builds from `toState.path` (already final, and for matched routes identical to `buildPath(name, params)`), so the typed URL survives and a refresh is idempotent to the same 404 state. Also drops one `buildPath` per successful navigation (parity with browser-plugin).
