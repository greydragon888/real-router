---
"@real-router/core": patch
---

Stop the `Router` constructor from mutating the caller's `options` object (#724)

The constructor extracted the logger config with `delete options.logger`, mutating the object the caller passed in — so reusing the same `options` (e.g. to build a second router or read it back) silently lost the `logger` key. The logger config is now read via a non-mutating destructure; the caller's object is left untouched and can be reused across routers.

Note: `@real-router/logger` remains a process-global singleton — `options.logger` configures one shared logger for the whole process and the last `configure()` wins across routers/`cloneRouter()` (now documented in `RouterOptions`). Per-router logger isolation is out of scope for this fix.
