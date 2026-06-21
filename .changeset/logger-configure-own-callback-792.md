---
"@real-router/logger": patch
---

Ignore a `callback` inherited from the config object's prototype in `logger.configure()` (#792)

`configure()` detected the callback key with `"callback" in config`, which walks the prototype chain — so `configure(Object.create({ callback }))` installed an inherited callback. It now uses `Object.hasOwn(config, "callback")`, so only an own property is merged. Explicitly passing `{ callback: undefined }` still clears the callback as before.
