---
"@real-router/core": patch
---

Guard `start()` against a non-string path with an actionable error (#939)

`start(undefined)` without a browser-plugin reached `matchPath(undefined)` and threw a cryptic, code-less `TypeError: Cannot read properties of undefined (reading 'codePointAt')` deep inside path-matcher.

Core now validates `typeof path === "string"` in `RouterLifecycleNamespace.start` — **after** the start interceptor chain, so a browser-plugin that injects the location (`next(path ?? getLocation())`) is unaffected; the guard only fires when nothing supplied a path. The rejection is now a clear `TypeError("[router.start] path must be a string, got undefined")`, symmetric with the `subscribe` / `navigateToNotFound` invariant guards. The FSM still recovers (STARTING → IDLE) so a subsequent well-formed `start()` succeeds.
